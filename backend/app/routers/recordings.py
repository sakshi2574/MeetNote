from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.recording import RecordingUploadResponse
from app.services.recording_service import (
    MAX_UPLOAD_BYTES,
    ensure_recordings_dir,
    is_webm_audio,
    normalize_meeting_code,
    recording_destination,
    recording_filename,
    save_recording_meeting,
)

router = APIRouter(prefix="/recordings", tags=["recordings"])


@router.post("/upload", response_model=RecordingUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_recording(
    file: UploadFile = File(...),
    meeting_code: str = Form(...),
    duration_seconds: int = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if duration_seconds < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="duration_seconds cannot be negative")

    try:
        code = normalize_meeting_code(meeting_code)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from None

    if not is_webm_audio(file.content_type):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Only WebM audio recordings are accepted")

    filename = recording_filename(code)
    try:
        destination = recording_destination(filename)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None

    ensure_recordings_dir()
    size = 0
    try:
        with destination.open("wb") as handle:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail="Recording exceeds the 100 MB limit",
                    )
                handle.write(chunk)
        if size == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Recording file is empty")

        meeting = save_recording_meeting(
            db,
            current_user.id,
            code,
            duration_seconds,
            f"recordings/{filename}",
        )
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return RecordingUploadResponse(
        meeting_id=meeting.id,
        meeting_code=meeting.meeting_code or code,
        filename=filename,
        duration_seconds=meeting.duration_seconds,
        status="uploaded",
    )
