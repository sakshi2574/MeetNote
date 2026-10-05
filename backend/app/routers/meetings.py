from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.meeting import MeetingCreate, MeetingResponse, MeetingUpdate
from app.services.meeting_service import (
    create_meeting,
    delete_meeting,
    get_user_meeting,
    get_user_meetings,
    update_meeting,
)

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.post("", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED)
def create(payload: MeetingCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_meeting(db, current_user.id, payload)


@router.get("", response_model=list[MeetingResponse])
def list_meetings(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=0, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_user_meetings(db, current_user.id, skip, limit)


@router.get("/{meeting_id}", response_model=MeetingResponse)
def read_meeting(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meeting = get_user_meeting(db, current_user.id, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return meeting


@router.put("/{meeting_id}", response_model=MeetingResponse)
def update(
    meeting_id: int,
    payload: MeetingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meeting = update_meeting(db, current_user.id, meeting_id, payload)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return meeting


@router.delete("/{meeting_id}")
def delete(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deleted = delete_meeting(db, current_user.id, meeting_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return {"detail": "Meeting deleted"}
