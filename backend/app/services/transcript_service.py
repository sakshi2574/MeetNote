from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.meeting import Meeting
from app.models.transcript_segment import TranscriptSegment
from app.schemas.transcript import TranscriptSegmentCreate, TranscriptSegmentUpdate
from app.services.meeting_service import get_user_meeting


def create_transcript_segment(
    db: Session,
    user_id: int,
    meeting_id: int,
    payload: TranscriptSegmentCreate,
) -> TranscriptSegment | None:
    meeting = get_user_meeting(db, user_id, meeting_id)
    if meeting is None:
        return None

    segment = TranscriptSegment(meeting_id=meeting.id, **payload.model_dump())
    db.add(segment)
    db.commit()
    db.refresh(segment)
    return segment


def get_meeting_transcript(
    db: Session,
    user_id: int,
    meeting_id: int,
) -> list[TranscriptSegment] | None:
    meeting = get_user_meeting(db, user_id, meeting_id)
    if meeting is None:
        return None

    statement = (
        select(TranscriptSegment)
        .where(TranscriptSegment.meeting_id == meeting.id)
        .order_by(TranscriptSegment.start_time.asc(), TranscriptSegment.id.asc())
    )
    return list(db.scalars(statement))


def get_transcript_segment(
    db: Session,
    user_id: int,
    segment_id: int,
) -> TranscriptSegment | None:
    statement = (
        select(TranscriptSegment)
        .join(Meeting, TranscriptSegment.meeting_id == Meeting.id)
        .where(TranscriptSegment.id == segment_id, Meeting.user_id == user_id)
    )
    return db.scalar(statement)


def update_transcript_segment(
    db: Session,
    user_id: int,
    segment_id: int,
    payload: TranscriptSegmentUpdate,
) -> TranscriptSegment | None:
    segment = get_transcript_segment(db, user_id, segment_id)
    if segment is None:
        return None

    updates = payload.model_dump(exclude_unset=True)
    start_time = updates.get("start_time", segment.start_time)
    end_time = updates.get("end_time", segment.end_time)
    if end_time < start_time:
        raise ValueError("end_time cannot be earlier than start_time")

    for field, value in updates.items():
        setattr(segment, field, value)

    db.commit()
    db.refresh(segment)
    return segment


def delete_transcript_segment(db: Session, user_id: int, segment_id: int) -> bool:
    segment = get_transcript_segment(db, user_id, segment_id)
    if segment is None:
        return False

    db.delete(segment)
    db.commit()
    return True
