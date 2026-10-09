from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.decision import Decision
from app.models.meeting import Meeting
from app.schemas.decision import DecisionCreate, DecisionUpdate
from app.services.meeting_service import get_user_meeting


def create_decision(
    db: Session,
    user_id: int,
    meeting_id: int,
    payload: DecisionCreate,
) -> Decision | None:
    meeting = get_user_meeting(db, user_id, meeting_id)
    if meeting is None:
        return None

    data = payload.model_dump(exclude_none=True)
    data.setdefault("timestamp", 0.0)
    decision = Decision(meeting_id=meeting.id, **data)
    db.add(decision)
    db.commit()
    db.refresh(decision)
    return decision


def get_meeting_decisions(
    db: Session,
    user_id: int,
    meeting_id: int,
) -> list[Decision] | None:
    meeting = get_user_meeting(db, user_id, meeting_id)
    if meeting is None:
        return None

    statement = (
        select(Decision)
        .where(Decision.meeting_id == meeting.id)
        .order_by(Decision.timestamp.asc(), Decision.id.asc())
    )
    return list(db.scalars(statement))


def get_decision(db: Session, user_id: int, decision_id: int) -> Decision | None:
    statement = (
        select(Decision)
        .join(Meeting, Decision.meeting_id == Meeting.id)
        .where(Decision.id == decision_id, Meeting.user_id == user_id)
    )
    return db.scalar(statement)


def update_decision(
    db: Session,
    user_id: int,
    decision_id: int,
    payload: DecisionUpdate,
) -> Decision | None:
    decision = get_decision(db, user_id, decision_id)
    if decision is None:
        return None

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(decision, field, value)
    if updates:
        decision.source = "manual"

    db.commit()
    db.refresh(decision)
    return decision


def delete_decision(db: Session, user_id: int, decision_id: int) -> bool:
    decision = get_decision(db, user_id, decision_id)
    if decision is None:
        return False

    db.delete(decision)
    db.commit()
    return True
