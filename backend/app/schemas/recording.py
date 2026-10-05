from pydantic import BaseModel


class RecordingUploadResponse(BaseModel):
    meeting_id: int
    meeting_code: str
    filename: str
    duration_seconds: int
    status: str
