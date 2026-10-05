from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.meeting import Meeting
from app.schemas.meeting import MeetingCreate, MeetingUpdate


def create_meeting(db: Session, user_id: int, payload: MeetingCreate) -> Meeting:
    data = payload.model_dump(exclude_none=True)
    meeting = Meeting(user_id=user_id, **data)
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


def get_user_meetings(db: Session, user_id: int, skip: int, limit: int) -> list[Meeting]:
    statement = (
        select(Meeting)
        .where(Meeting.user_id == user_id)
        .order_by(Meeting.id.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(db.scalars(statement))


def get_user_meeting(db: Session, user_id: int, meeting_id: int) -> Meeting | None:
    statement = select(Meeting).where(Meeting.id == meeting_id, Meeting.user_id == user_id)
    return db.scalar(statement)


def update_meeting(
    db: Session,
    user_id: int,
    meeting_id: int,
    payload: MeetingUpdate,
) -> Meeting | None:
    meeting = get_user_meeting(db, user_id, meeting_id)
    if meeting is None:
        return None

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(meeting, field, value)

    db.commit()
    db.refresh(meeting)
    return meeting


def delete_meeting(db: Session, user_id: int, meeting_id: int) -> bool:
    meeting = get_user_meeting(db, user_id, meeting_id)
    if meeting is None:
        return False

    db.delete(meeting)
    db.commit()
    return True
