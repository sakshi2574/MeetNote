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
WEBM_MEDIA_TYPES = {"audio/webm", "video/webm"}
# MediaRecorder writes the video CodecID in the WebM header, before media clusters.
_VIDEO_CODEC_MARKERS = (b"V_VP8", b"V_VP9", b"V_AV1")
# EBML Cluster element ID. Media payload starts here, so a codec string after this
# point is not a track header.
_CLUSTER_ELEMENT_ID = b"\x1f\x43\xb6\x75"
_HEADER_SCAN_BYTES = 2 * 1024 * 1024


def normalize_meeting_code(meeting_code: str) -> str:
    cleaned = meeting_code.strip().lower()
    if not cleaned:
        raise ValueError("meeting_code cannot be empty")
    if not MEETING_CODE_RE.fullmatch(cleaned) or len(cleaned) > 64:
        raise ValueError("meeting_code is invalid")
    return cleaned


def _media_type_base(content_type: str | None) -> str:
    if not content_type:
        return ""
    return content_type.split(";", 1)[0].strip().lower()


def is_webm_audio(content_type: str | None) -> bool:
    return _media_type_base(content_type) == "audio/webm"


def is_webm_recording(content_type: str | None) -> bool:
    return _media_type_base(content_type) in WEBM_MEDIA_TYPES


def recording_media_type(path: Path) -> str:
    """Return the playback type for a stored WebM file.

    Older recordings are audio-only. Current recordings include a VP8, VP9, or AV1
    track, which is identified from the file header rather than the upload label.
    """
    if path.suffix.lower() != ".webm":
        return "application/octet-stream"
    try:
        with path.open("rb") as handle:
            header = handle.read(_HEADER_SCAN_BYTES)
    except OSError:
        return "audio/webm"
    cluster_at = header.find(_CLUSTER_ELEMENT_ID)
    header_bytes = header if cluster_at < 0 else header[:cluster_at]
    if any(marker in header_bytes for marker in _VIDEO_CODEC_MARKERS):
        return "video/webm"
    return "audio/webm"


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
            transcription_status="pending",
            transcription_language=None,
            transcription_error=None,
        )
        db.add(meeting)
    else:
        meeting.recording_path = relative_path
        meeting.transcription_status = "pending"
        meeting.transcription_language = None
        meeting.transcription_error = None
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


def resolve_stored_recording(recording_path: str | None) -> Path | None:
    # Upload stores "recordings/<filename>" relative to backend/uploads.
    # The client never supplies a filesystem path; only a file inside RECORDINGS_DIR is returned.
    if not isinstance(recording_path, str):
        return None

    raw = recording_path.strip()
    if not raw:
        return None

    try:
        candidate = Path(raw)
    except (TypeError, ValueError):
        return None

    if candidate.is_absolute() or candidate.anchor:
        return None
    if any(part == ".." for part in candidate.parts):
        return None

    relative_parts = candidate.parts
    if relative_parts[0] == "recordings":
        relative_parts = relative_parts[1:]
    if not relative_parts:
        return None

    root = RECORDINGS_DIR.resolve()
    try:
        resolved = root.joinpath(*relative_parts).resolve()
    except (OSError, RuntimeError, ValueError):
        return None

    if not resolved.is_relative_to(root) or not resolved.is_file():
        return None
    return resolved
