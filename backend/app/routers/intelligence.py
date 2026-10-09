from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.intelligence import IntelligenceResponse, SummaryUpdate
from app.services.intelligence_service import (
    IntelligenceBusy,
    intelligence_snapshot,
    run_meeting_intelligence,
    save_manual_summary,
)
from app.services.meeting_service import get_user_meeting

router = APIRouter(tags=["intelligence"])


@router.get("/meetings/{meeting_id}/intelligence", response_model=IntelligenceResponse)
def read_intelligence(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meeting = get_user_meeting(db, current_user.id, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return intelligence_snapshot(meeting)


@router.post("/meetings/{meeting_id}/intelligence", response_model=IntelligenceResponse)
def regenerate_intelligence(
    meeting_id: int,
    replace_summary: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meeting = get_user_meeting(db, current_user.id, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    # The run writes on its own session. Release this one first so SQLite
    # does not see two writers from the same request.
    db.close()
    try:
        run_meeting_intelligence(meeting_id, replace_summary=replace_summary)
    except IntelligenceBusy:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Meeting insights are already being generated",
        ) from None
    meeting = get_user_meeting(db, current_user.id, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return intelligence_snapshot(meeting)


@router.put("/meetings/{meeting_id}/summary", response_model=IntelligenceResponse)
def update_summary(
    meeting_id: int,
    payload: SummaryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meeting = get_user_meeting(db, current_user.id, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    save_manual_summary(db, meeting, payload.summary)
    return intelligence_snapshot(meeting)
