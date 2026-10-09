from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.transcription import TranscriptionResponse, TranscriptionStatusResponse
from app.services.meeting_service import get_user_meeting
from app.services.recording_service import resolve_stored_recording
from app.services.transcription_jobs import (
    PENDING,
    PROCESSING,
    enqueue_transcription,
    sync_transcribe,
    transcription_snapshot,
)
from app.services.transcription_service import (
    EmptyTranscription,
    TranscriptionError,
    claim_transcription,
    release_transcription,
)

router = APIRouter(tags=["transcription"])


@router.post("/meetings/{meeting_id}/transcribe", response_model=TranscriptionResponse)
def transcribe_meeting(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meeting = get_user_meeting(db, current_user.id, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    recording_file = resolve_stored_recording(meeting.recording_path)
    if recording_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")

    if not claim_transcription(meeting.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transcription is already in progress",
        )

    try:
        try:
            result, saved = sync_transcribe(db, meeting)
        except FileNotFoundError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found") from None
        except EmptyTranscription:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="No speech was detected",
            ) from None
        except TranscriptionError:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Transcription failed") from None
        except SQLAlchemyError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Transcript could not be saved",
            ) from None

        return TranscriptionResponse(
            meeting_id=meeting.id,
            text=result.text,
            language=result.language,
            segments=saved,
        )
    finally:
        release_transcription(meeting.id)


@router.get("/meetings/{meeting_id}/transcription", response_model=TranscriptionStatusResponse)
def read_transcription_status(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meeting = get_user_meeting(db, current_user.id, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return transcription_snapshot(db, meeting)


@router.post("/meetings/{meeting_id}/transcription/retry", response_model=TranscriptionStatusResponse)
def retry_transcription(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meeting = get_user_meeting(db, current_user.id, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    if resolve_stored_recording(meeting.recording_path) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    if meeting.transcription_status not in (PENDING, PROCESSING):
        meeting.transcription_status = PENDING
        meeting.transcription_language = None
        meeting.transcription_error = None
        db.commit()
        db.refresh(meeting)
        enqueue_transcription(meeting.id, meeting.recording_path or "")
    return transcription_snapshot(db, meeting)
