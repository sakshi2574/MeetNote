from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.action_item import ActionItemCreate, ActionItemResponse, ActionItemUpdate
from app.services.action_item_service import (
    create_action_item,
    delete_action_item,
    get_meeting_action_items,
    update_action_item,
)

router = APIRouter(tags=["action-items"])


@router.post(
    "/meetings/{meeting_id}/action-items",
    response_model=ActionItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_item(
    meeting_id: int,
    payload: ActionItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = create_action_item(db, current_user.id, meeting_id, payload)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return item


@router.get("/meetings/{meeting_id}/action-items", response_model=list[ActionItemResponse])
def list_items(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = get_meeting_action_items(db, current_user.id, meeting_id)
    if items is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return items


@router.put("/action-items/{item_id}", response_model=ActionItemResponse)
def update_item(
    item_id: int,
    payload: ActionItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = update_action_item(db, current_user.id, item_id, payload)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action item not found")
    return item


@router.delete("/action-items/{item_id}")
def delete_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deleted = delete_action_item(db, current_user.id, item_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action item not found")
    return {"detail": "Action item deleted"}
