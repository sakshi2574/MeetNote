from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.action_item import ActionItem
from app.models.meeting import Meeting


def get_dashboard_stats(db: Session, user_id: int) -> dict:
    """Calculate dashboard statistics for one authenticated user."""

    meeting_stats = (
        db.query(
            func.count(Meeting.id).label("total_meetings"),
            func.coalesce(func.sum(Meeting.duration_seconds), 0).label(
                "total_duration_seconds"
            ),
        )
        .filter(Meeting.user_id == user_id)
        .one()
    )

    action_stats = (
        db.query(
            func.count(ActionItem.id).label("total_action_items"),
            func.coalesce(
                func.sum(
                    case(
                        (func.lower(ActionItem.status) == "pending", 1),
                        else_=0,
                    )
                ),
                0,
            ).label("pending_action_items"),
            func.coalesce(
                func.sum(
                    case(
                        (func.lower(ActionItem.status) == "completed", 1),
                        else_=0,
                    )
                ),
                0,
            ).label("completed_action_items"),
        )
        .join(Meeting, ActionItem.meeting_id == Meeting.id)
        .filter(Meeting.user_id == user_id)
        .one()
    )

    recent_meetings = (
        db.query(Meeting)
        .filter(Meeting.user_id == user_id)
        .order_by(Meeting.meeting_date.desc(), Meeting.id.desc())
        .limit(5)
        .all()
    )

    return {
        "total_meetings": meeting_stats.total_meetings,
        "total_recording_hours": round(
            meeting_stats.total_duration_seconds / 3600, 2
        ),
        "total_action_items": action_stats.total_action_items,
        "pending_action_items": action_stats.pending_action_items,
        "completed_action_items": action_stats.completed_action_items,
        "recent_meetings": recent_meetings,
    }