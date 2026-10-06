import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.transcription import TranscriptionResponse
from app.services.meeting_service import get_user_meeting
from app.services.recording_service import resolve_stored_recording
from app.services.transcript_service import replace_generated_transcript
from app.services.transcription_service import TranscriptionError, transcribe_recording

logger = logging.getLogger(__name__)

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

    try:
        result = transcribe_recording(recording_file)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found") from None
    except TranscriptionError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Transcription failed") from None

    try:
        segment = replace_generated_transcript(db, meeting, result.text)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Transcription failed") from None
    except SQLAlchemyError:
        logger.error("Failed to save generated transcript")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Transcript could not be saved",
        ) from None

    return TranscriptionResponse(meeting_id=meeting.id, text=segment.text, segments=[segment])
