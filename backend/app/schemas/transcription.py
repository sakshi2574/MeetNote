from pydantic import BaseModel, ConfigDict

from app.schemas.transcript import TranscriptSegmentResponse


class TranscriptionResponse(BaseModel):
    meeting_id: int
    text: str
    segments: list[TranscriptSegmentResponse]

    model_config = ConfigDict(from_attributes=True)
