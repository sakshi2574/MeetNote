"""Persist meeting intelligence extracted from the saved transcript.

Generated rows use source "ai". Each run deletes the previous "ai" rows and
inserts the new ones in one commit, so retries do not duplicate them. Rows a
user created or edited have source "manual" and are never deleted here. A
generated row whose origin matches an edited row is skipped, so an edited item
does not reappear next to its edited copy.

Runs happen inside the API process: after a transcript is saved by the
transcription worker, or when a user asks to regenerate. A run that is
interrupted by a restart is marked failed at the next startup.
"""

import logging
import threading

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.action_item import ActionItem
from app.models.decision import Decision
from app.models.meeting import Meeting
from app.models.transcript_segment import TranscriptSegment
from app.services.meeting_extraction import (
    MeetingIntelligence,
    TranscriptLine,
    normalize_text,
    extract_meeting_intelligence,
)

logger = logging.getLogger(__name__)

PENDING = "pending"
PROCESSING = "processing"
COMPLETED = "completed"
FAILED = "failed"

GENERATED = "ai"
MANUAL = "manual"
METHOD = "rule-based"

FAILED_ERROR = "Meeting insights could not be generated."
RESTART_ERROR = "Insight generation stopped when the server restarted."

_active: set[int] = set()
_active_lock = threading.Lock()


class IntelligenceBusy(Exception):
    """Insights for this meeting are already being generated."""


def run_meeting_intelligence(meeting_id: int, *, replace_summary: bool = False) -> bool:
    """Generate and store insights for one meeting on a new session.

    Returns True when results were saved. Raises IntelligenceBusy when another
    run for the same meeting is in progress. Other failures are recorded on the
    meeting and return False, so a caller's transcription is never affected.
    """
    with _active_lock:
        if meeting_id in _active:
            raise IntelligenceBusy
        _active.add(meeting_id)
    db = SessionLocal()
    try:
        meeting = db.get(Meeting, meeting_id)
        if meeting is None:
            return False
        _set_status(db, meeting_id, PROCESSING, None)
        db.refresh(meeting)
        try:
            _generate_and_store(db, meeting, replace_summary=replace_summary)
        except Exception:
            logger.exception("Meeting insight generation failed")
            db.rollback()
            _set_status(db, meeting_id, FAILED, FAILED_ERROR)
            return False
        return True
    finally:
        db.close()
        with _active_lock:
            _active.discard(meeting_id)


def recover_interrupted_intelligence() -> None:
    db = SessionLocal()
    try:
        db.execute(
            update(Meeting)
            .where(Meeting.intelligence_status.in_((PENDING, PROCESSING)))
            .values(intelligence_status=FAILED, intelligence_error=RESTART_ERROR)
        )
        db.commit()
    finally:
        db.close()


def reset_intelligence_state() -> None:
    with _active_lock:
        _active.clear()


def intelligence_snapshot(meeting: Meeting) -> dict:
    return {
        "meeting_id": meeting.id,
        "status": meeting.intelligence_status,
        "error": meeting.intelligence_error,
        "method": METHOD,
        "summary": meeting.summary,
        "summary_source": _summary_source(meeting),
        "key_points": _key_points(meeting.key_points),
    }


def save_manual_summary(db: Session, meeting: Meeting, summary: str) -> Meeting:
    meeting.summary = summary
    meeting.summary_source = MANUAL
    db.commit()
    db.refresh(meeting)
    return meeting


def _generate_and_store(db: Session, meeting: Meeting, *, replace_summary: bool) -> None:
    segments = db.scalars(
        select(TranscriptSegment)
        .where(TranscriptSegment.meeting_id == meeting.id)
        .order_by(TranscriptSegment.start_time.asc(), TranscriptSegment.id.asc())
    ).all()
    lines = [
        TranscriptLine(text=segment.text, start=segment.start_time, speaker=segment.speaker)
        for segment in segments
    ]
    meeting_date = meeting.meeting_date.date() if meeting.meeting_date else None
    result = extract_meeting_intelligence(lines, meeting_date)
    _store(db, meeting, result, replace_summary=replace_summary)


def _store(db: Session, meeting: Meeting, result: MeetingIntelligence, *, replace_summary: bool) -> None:
    if replace_summary or _summary_source(meeting) in (None, GENERATED):
        meeting.summary = result.summary
        meeting.summary_source = GENERATED if result.summary else None
    meeting.key_points = [
        {"text": point.text, "timestamp": round(point.timestamp, 2)} for point in result.key_points
    ]

    db.execute(
        delete(ActionItem).where(ActionItem.meeting_id == meeting.id, ActionItem.source == GENERATED)
    )
    kept_items = db.scalars(select(ActionItem).where(ActionItem.meeting_id == meeting.id)).all()
    kept_origins = {item.origin_key for item in kept_items if item.origin_key}
    kept_tasks = {normalize_text(item.task) for item in kept_items}
    for candidate in result.action_items:
        if candidate.origin_key in kept_origins or normalize_text(candidate.task) in kept_tasks:
            continue
        db.add(
            ActionItem(
                meeting_id=meeting.id,
                task=candidate.task,
                assignee=candidate.assignee,
                due_date=candidate.due_date,
                status="pending",
                timestamp=candidate.timestamp,
                source=GENERATED,
                origin_key=candidate.origin_key,
            )
        )

    db.execute(delete(Decision).where(Decision.meeting_id == meeting.id, Decision.source == GENERATED))
    kept_decisions = db.scalars(select(Decision).where(Decision.meeting_id == meeting.id)).all()
    kept_decision_origins = {item.origin_key for item in kept_decisions if item.origin_key}
    kept_decision_text = {normalize_text(item.decision) for item in kept_decisions}
    for candidate in result.decisions:
        if (
            candidate.origin_key in kept_decision_origins
            or normalize_text(candidate.decision) in kept_decision_text
        ):
            continue
        db.add(
            Decision(
                meeting_id=meeting.id,
                decision=candidate.decision,
                timestamp=candidate.timestamp,
                context=candidate.context,
                source=GENERATED,
                origin_key=candidate.origin_key,
            )
        )

    meeting.intelligence_status = COMPLETED
    meeting.intelligence_error = None
    db.commit()


def _set_status(db: Session, meeting_id: int, status: str, error: str | None) -> None:
    db.execute(
        update(Meeting)
        .where(Meeting.id == meeting_id)
        .values(intelligence_status=status, intelligence_error=error)
    )
    db.commit()


def _summary_source(meeting: Meeting) -> str | None:
    if meeting.summary is None:
        return None
    # A summary saved before this field existed was not generated here.
    return meeting.summary_source or MANUAL


def _key_points(raw) -> list[dict]:
    if not isinstance(raw, list):
        return []
    points: list[dict] = []
    for entry in raw:
        if isinstance(entry, str) and entry.strip():
            points.append({"text": entry.strip(), "timestamp": None})
        elif isinstance(entry, dict) and isinstance(entry.get("text"), str) and entry["text"].strip():
            timestamp = entry.get("timestamp")
            points.append(
                {
                    "text": entry["text"].strip(),
                    "timestamp": float(timestamp) if isinstance(timestamp, (int, float)) else None,
                }
            )
    return points
