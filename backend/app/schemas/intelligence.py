from pydantic import BaseModel, Field, field_validator


class KeyPointResponse(BaseModel):
    text: str
    timestamp: float | None = None


class IntelligenceResponse(BaseModel):
    meeting_id: int
    status: str | None = None
    error: str | None = None
    method: str
    summary: str | None = None
    summary_source: str | None = None
    key_points: list[KeyPointResponse] = []


class SummaryUpdate(BaseModel):
    summary: str = Field(min_length=1, max_length=5000)

    @field_validator("summary")
    @classmethod
    def summary_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Summary cannot be empty")
        return cleaned
