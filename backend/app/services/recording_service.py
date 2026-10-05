import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR
from app.models.meeting import Meeting

MAX_UPLOAD_BYTES = 100 * 1024 * 1024
RECORDINGS_DIR = BACKEND_DIR / "uploads" / "recordings"
MEETING_CODE_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
ALLOWED_WEBM_TYPES = {"audio/webm", "audio/webm;codecs=opus"}


def normalize_meeting_code(meeting_code: str) -> str:
    cleaned = meeting_code.strip().lower()
    if not cleaned:
        raise ValueError("meeting_code cannot be empty")
    if not MEETING_CODE_RE.fullmatch(cleaned) or len(cleaned) > 64:
        raise ValueError("meeting_code is invalid")
    return cleaned


def is_webm_audio(content_type: str | None) -> bool:
    if not content_type:
        return False
    normalized = content_type.lower().replace(" ", "")
    return normalized in ALLOWED_WEBM_TYPES


def recording_filename(meeting_code: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{meeting_code}_{stamp}_{uuid4().hex}.webm"


def recording_destination(filename: str) -> Path:
    directory = RECORDINGS_DIR.resolve()
    destination = (directory / filename).resolve()
    if not destination.is_relative_to(directory):
        raise ValueError("Recording path is invalid")
    return destination


def ensure_recordings_dir() -> None:
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)


def find_user_meeting_by_code(db: Session, user_id: int, meeting_code: str) -> Meeting | None:
    statement = (
        select(Meeting)
        .where(Meeting.user_id == user_id, Meeting.meeting_code == meeting_code)
        .order_by(Meeting.id.desc())
    )
    return db.scalars(statement).first()


def save_recording_meeting(
    db: Session,
    user_id: int,
    meeting_code: str,
    duration_seconds: int,
    relative_path: str,
) -> Meeting:
    meeting = find_user_meeting_by_code(db, user_id, meeting_code)
    previous_path = meeting.recording_path if meeting is not None else None
    if meeting is None:
        meeting = Meeting(
            user_id=user_id,
            title=f"Google Meet - {meeting_code}",
            meeting_code=meeting_code,
            duration_seconds=duration_seconds,
            platform="Google Meet",
            status="completed",
            recording_path=relative_path,
        )
        db.add(meeting)
    else:
        meeting.recording_path = relative_path
        if duration_seconds > meeting.duration_seconds:
            meeting.duration_seconds = duration_seconds

    db.commit()
    db.refresh(meeting)
    _remove_replaced_recording(previous_path, relative_path)
    return meeting


def _remove_replaced_recording(previous_path: str | None, relative_path: str) -> None:
    if not previous_path or previous_path == relative_path:
        return
    root = (BACKEND_DIR / "uploads" / "recordings").resolve()
    previous = (BACKEND_DIR / "uploads" / previous_path).resolve()
    if not previous.is_relative_to(root):
        return
    try:
        previous.unlink(missing_ok=True)
    except OSError:
        return
