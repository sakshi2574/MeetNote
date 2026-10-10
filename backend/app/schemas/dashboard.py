from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RecentMeetingResponse(BaseModel):
    id: int
    title: str
    meeting_date: datetime
    duration_seconds: int
    status: str

    model_config = ConfigDict(from_attributes=True)


class DashboardStatsResponse(BaseModel):
    total_meetings: int
    total_recording_hours: float
    total_action_items: int
    pending_action_items: int
    completed_action_items: int
    recent_meetings: list[RecentMeetingResponse]