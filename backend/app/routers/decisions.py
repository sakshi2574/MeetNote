from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.decision import DecisionCreate, DecisionResponse, DecisionUpdate
from app.services.decision_service import (
    create_decision,
    delete_decision,
    get_meeting_decisions,
    update_decision,
)

router = APIRouter(tags=["decisions"])


@router.post(
    "/meetings/{meeting_id}/decisions",
    response_model=DecisionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_item(
    meeting_id: int,
    payload: DecisionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    decision = create_decision(db, current_user.id, meeting_id, payload)
    if decision is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return decision


@router.get("/meetings/{meeting_id}/decisions", response_model=list[DecisionResponse])
def list_items(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    decisions = get_meeting_decisions(db, current_user.id, meeting_id)
    if decisions is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return decisions


@router.put("/decisions/{decision_id}", response_model=DecisionResponse)
def update_item(
    decision_id: int,
    payload: DecisionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    decision = update_decision(db, current_user.id, decision_id, payload)
    if decision is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")
    return decision


@router.delete("/decisions/{decision_id}")
def delete_item(
    decision_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deleted = delete_decision(db, current_user.id, decision_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")
    return {"detail": "Decision deleted"}
