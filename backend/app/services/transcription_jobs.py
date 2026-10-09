"""In-process transcription queue.

This is not a durable queue. Jobs live in memory in the API process and run on
one daemon thread. If the process stops while a job is pending or processing,
the next startup marks that meeting failed. A finished transcript is recorded
only after its segments commit.
"""

import logging
import threading
import time
from collections import deque

from sqlalchemy import func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.meeting import Meeting
from app.models.transcript_segment import TranscriptSegment
from app.services import intelligence_service
from app.services.recording_service import resolve_stored_recording
from app.services.transcript_service import replace_generated_transcript
from app.services.transcription_service import (
    EmptyTranscription,
    TranscriptionError,
    TranscriptionResult,
    claim_transcription,
    release_transcription,
    transcribe_recording,
)

logger = logging.getLogger(__name__)

PENDING = "pending"
PROCESSING = "processing"
COMPLETED = "completed"
FAILED = "failed"

RESTART_ERROR = "Transcription stopped when the server restarted."
FAILED_ERROR = "Transcription failed."
EMPTY_ERROR = "No speech was detected."
MISSING_ERROR = "Recording not found."
SAVE_ERROR = "The transcript could not be saved."

_lock = threading.Lock()
_queue: deque[tuple[int, str]] = deque()
_pending_keys: set[tuple[int, str]] = set()
_active: tuple[int, str] | None = None
_thread: threading.Thread | None = None
_stop = threading.Event()
_requeues: dict[tuple[int, str], int] = {}
_MAX_REQUEUE = 30


class SupersededTranscription(Exception):
    """A newer recording replaced this one before its transcript was saved."""


def reset_transcription_state() -> None:
    with _lock:
        _queue.clear()
        _pending_keys.clear()
        _requeues.clear()
        global _active
        _active = None


def start_transcription_jobs() -> None:
    _stop.clear()


def shutdown_transcription_jobs() -> None:
    """Stop taking new jobs. An in-flight Whisper call is not cancelled."""
    _stop.set()


def enqueue_transcription(meeting_id: int, recording_path: str) -> bool:
    """Queue one transcription. The same recording is not queued twice."""
    if _stop.is_set() or not recording_path:
        return False
    key = (meeting_id, recording_path)
    with _lock:
        if key == _active or key in _pending_keys:
            return False
        stale = [item for item in _queue if item[0] == meeting_id]
        for item in stale:
            _queue.remove(item)
            _pending_keys.discard(item)
        _queue.append(key)
        _pending_keys.add(key)
        _ensure_worker_locked()
    return True


def recover_interrupted_transcriptions() -> None:
    db = SessionLocal()
    try:
        db.execute(
            update(Meeting)
            .where(Meeting.transcription_status.in_((PENDING, PROCESSING)))
            .values(transcription_status=FAILED, transcription_error=RESTART_ERROR)
        )
        db.commit()
    finally:
        db.close()


def transcription_snapshot(db: Session, meeting: Meeting) -> dict:
    count = db.scalar(
        select(func.count())
        .select_from(TranscriptSegment)
        .where(TranscriptSegment.meeting_id == meeting.id)
    )
    return {
        "meeting_id": meeting.id,
        "status": meeting.transcription_status,
        "language": meeting.transcription_language,
        "segment_count": int(count or 0),
        "error": meeting.transcription_error,
    }


def sync_transcribe(db: Session, meeting: Meeting) -> tuple[TranscriptionResult, list]:
    """Transcribe the meeting's current recording on the caller's session."""
    stored = _transcribe_and_store(db, meeting, meeting.recording_path or "")
    _generate_insights(meeting.id)
    return stored


def run_transcription_job(meeting_id: int, recording_path: str) -> bool:
    """Run one job. Return True when the model is busy and the job should wait."""
    db = SessionLocal()
    claimed = False
    try:
        meeting = db.get(Meeting, meeting_id)
        if meeting is None or meeting.recording_path != recording_path:
            return False
        if not claim_transcription(meeting_id):
            return True
        claimed = True
        try:
            _transcribe_and_store(db, meeting, recording_path)
        except SupersededTranscription:
            return False
        except (EmptyTranscription, FileNotFoundError, TranscriptionError, SQLAlchemyError):
            return False
        except Exception:
            logger.exception("Transcription job failed")
            _mark_failed(db, meeting_id, recording_path, FAILED_ERROR)
            return False
        _generate_insights(meeting_id)
        return False
    finally:
        if claimed:
            release_transcription(meeting_id)
        db.close()


def _transcribe_and_store(
    db: Session,
    meeting: Meeting,
    expected_path: str,
) -> tuple[TranscriptionResult, list]:
    if not _claim_status(db, meeting.id, expected_path, PROCESSING, error=None):
        raise SupersededTranscription

    recording = resolve_stored_recording(expected_path)
    if recording is None:
        _mark_failed(db, meeting.id, expected_path, MISSING_ERROR)
        raise FileNotFoundError(expected_path)
    try:
        result = transcribe_recording(recording)
    except EmptyTranscription:
        _mark_failed(db, meeting.id, expected_path, EMPTY_ERROR)
        raise
    except TranscriptionError:
        _mark_failed(db, meeting.id, expected_path, FAILED_ERROR)
        raise

    db.refresh(meeting)
    if meeting.recording_path != expected_path:
        raise SupersededTranscription
    meeting.transcription_status = COMPLETED
    meeting.transcription_language = result.language
    meeting.transcription_error = None
    # Committed with the segments, so the page keeps polling until insights
    # for this transcript are saved.
    meeting.intelligence_status = intelligence_service.PENDING
    meeting.intelligence_error = None
    try:
        saved = replace_generated_transcript(db, meeting, result.segments)
    except ValueError:
        _mark_failed(db, meeting.id, expected_path, FAILED_ERROR)
        raise TranscriptionError("Transcription failed") from None
    except SQLAlchemyError:
        logger.error("Failed to save generated transcript")
        _mark_failed(db, meeting.id, expected_path, SAVE_ERROR)
        raise
    return result, saved


def _generate_insights(meeting_id: int) -> None:
    """Extract insights from the saved transcript. Failures never undo it."""
    try:
        intelligence_service.run_meeting_intelligence(meeting_id)
    except intelligence_service.IntelligenceBusy:
        pass
    except Exception:
        logger.exception("Meeting insights failed after transcription")


def _claim_status(db: Session, meeting_id: int, expected_path: str, status: str, error: str | None) -> bool:
    result = db.execute(
        update(Meeting)
        .where(Meeting.id == meeting_id, Meeting.recording_path == expected_path)
        .values(transcription_status=status, transcription_error=error)
    )
    db.commit()
    return result.rowcount == 1


def _mark_failed(db: Session, meeting_id: int, expected_path: str, message: str) -> None:
    db.rollback()
    _claim_status(db, meeting_id, expected_path, FAILED, message)


def _ensure_worker_locked() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _thread = threading.Thread(target=_worker, name="meetnote-transcription", daemon=True)
    _thread.start()


def _worker() -> None:
    global _thread, _active
    while not _stop.is_set():
        with _lock:
            if not _queue:
                _thread = None
                return
            key = _queue.popleft()
            _pending_keys.discard(key)
            _active = key
        requeue = False
        try:
            requeue = run_transcription_job(key[0], key[1])
        except Exception:
            logger.exception("Transcription job crashed")
            db = SessionLocal()
            try:
                _mark_failed(db, key[0], key[1], FAILED_ERROR)
            finally:
                db.close()
        finally:
            with _lock:
                if _active == key:
                    _active = None
        if requeue and not _stop.is_set():
            with _lock:
                attempts = _requeues.get(key, 0) + 1
                _requeues[key] = attempts
            if attempts > _MAX_REQUEUE:
                db = SessionLocal()
                try:
                    _mark_failed(db, key[0], key[1], FAILED_ERROR)
                finally:
                    db.close()
            else:
                time.sleep(0.2)
                enqueue_transcription(key[0], key[1])
