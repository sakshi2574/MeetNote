from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.services.export_service import ExportFormat, ExportOptions, export_meeting
from app.services.meeting_service import get_user_meeting

router = APIRouter(tags=["exports"])


@router.get("/meetings/{meeting_id}/export")
def export_meeting_file(
    meeting_id: int,
    export_format: ExportFormat = Query(default=ExportFormat.PDF, alias="format"),
    details: bool = Query(default=True),
    summary: bool = Query(default=True),
    action_items: bool = Query(default=True),
    decisions: bool = Query(default=True),
    transcript: bool = Query(default=True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meeting = get_user_meeting(db, current_user.id, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    options = ExportOptions(
        details=details,
        summary=summary,
        action_items=action_items,
        decisions=decisions,
        transcript=transcript,
    )
    if not options.included():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Select at least one section to export.",
        )

    exported = export_meeting(db, meeting, export_format, options)
    return Response(
        content=exported.content,
        media_type=exported.media_type,
        headers={
            "Content-Disposition": exported.content_disposition,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
