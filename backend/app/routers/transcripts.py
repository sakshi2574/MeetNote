from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.transcript import (
    TranscriptSegmentCreate,
    TranscriptSegmentResponse,
    TranscriptSegmentUpdate,
)
from app.services.transcript_service import (
    create_transcript_segment,
    delete_transcript_segment,
    get_meeting_transcript,
    update_transcript_segment,
)

router = APIRouter(tags=["transcripts"])


@router.post(
    "/meetings/{meeting_id}/transcript",
    response_model=TranscriptSegmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_segment(
    meeting_id: int,
    payload: TranscriptSegmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    segment = create_transcript_segment(db, current_user.id, meeting_id, payload)
    if segment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return segment


@router.get("/meetings/{meeting_id}/transcript", response_model=list[TranscriptSegmentResponse])
def read_transcript(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    segments = get_meeting_transcript(db, current_user.id, meeting_id)
    if segments is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return segments


@router.put("/transcript/{segment_id}", response_model=TranscriptSegmentResponse)
def update_segment(
    segment_id: int,
    payload: TranscriptSegmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        segment = update_transcript_segment(db, current_user.id, segment_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from None
    if segment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcript segment not found")
    return segment


@router.delete("/transcript/{segment_id}")
def delete_segment(
    segment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deleted = delete_transcript_segment(db, current_user.id, segment_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcript segment not found")
    return {"detail": "Transcript segment deleted"}
