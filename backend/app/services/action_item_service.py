from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.action_item import ActionItem
from app.models.meeting import Meeting
from app.schemas.action_item import ActionItemCreate, ActionItemUpdate
from app.services.meeting_service import get_user_meeting


def create_action_item(
    db: Session,
    user_id: int,
    meeting_id: int,
    payload: ActionItemCreate,
) -> ActionItem | None:
    meeting = get_user_meeting(db, user_id, meeting_id)
    if meeting is None:
        return None

    item = ActionItem(meeting_id=meeting.id, **payload.model_dump(exclude_none=True))
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_meeting_action_items(
    db: Session,
    user_id: int,
    meeting_id: int,
) -> list[ActionItem] | None:
    meeting = get_user_meeting(db, user_id, meeting_id)
    if meeting is None:
        return None

    statement = (
        select(ActionItem)
        .where(ActionItem.meeting_id == meeting.id)
        .order_by(ActionItem.created_at.asc(), ActionItem.id.asc())
    )
    return list(db.scalars(statement))


def get_action_item(db: Session, user_id: int, item_id: int) -> ActionItem | None:
    statement = (
        select(ActionItem)
        .join(Meeting, ActionItem.meeting_id == Meeting.id)
        .where(ActionItem.id == item_id, Meeting.user_id == user_id)
    )
    return db.scalar(statement)


def update_action_item(
    db: Session,
    user_id: int,
    item_id: int,
    payload: ActionItemUpdate,
) -> ActionItem | None:
    item = get_action_item(db, user_id, item_id)
    if item is None:
        return None

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


def delete_action_item(db: Session, user_id: int, item_id: int) -> bool:
    item = get_action_item(db, user_id, item_id)
    if item is None:
        return False

    db.delete(item)
    db.commit()
    return True
