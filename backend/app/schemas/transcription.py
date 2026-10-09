from pydantic import BaseModel, ConfigDict

from app.schemas.transcript import TranscriptSegmentResponse


class TranscriptionResponse(BaseModel):
    meeting_id: int
    text: str
    language: str | None = None
    segments: list[TranscriptSegmentResponse]

    model_config = ConfigDict(from_attributes=True)


class TranscriptionStatusResponse(BaseModel):
    meeting_id: int
    status: str | None = None
    language: str | None = None
    segment_count: int = 0
    error: str | None = None
