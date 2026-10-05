from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _required_text(value: str, label: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{label} cannot be empty")
    return cleaned


class TranscriptSegmentCreate(BaseModel):
    speaker: str = Field(min_length=1, max_length=255)
    start_time: float = Field(ge=0)
    end_time: float = Field(ge=0)
    text: str = Field(min_length=1)

    @field_validator("speaker")
    @classmethod
    def speaker_not_blank(cls, value: str) -> str:
        return _required_text(value, "Speaker")

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        return _required_text(value, "Text")

    @model_validator(mode="after")
    def end_not_before_start(self):
        if self.end_time < self.start_time:
            raise ValueError("end_time cannot be earlier than start_time")
        return self


class TranscriptSegmentUpdate(BaseModel):
    speaker: str | None = Field(default=None, max_length=255)
    start_time: float | None = Field(default=None, ge=0)
    end_time: float | None = Field(default=None, ge=0)
    text: str | None = None

    @field_validator("speaker")
    @classmethod
    def speaker_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _required_text(value, "Speaker")

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _required_text(value, "Text")

    @model_validator(mode="after")
    def validate_update(self):
        for field_name in ("speaker", "text", "start_time", "end_time"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be empty")
        if (
            self.start_time is not None
            and self.end_time is not None
            and self.end_time < self.start_time
        ):
            raise ValueError("end_time cannot be earlier than start_time")
        return self


class TranscriptSegmentResponse(BaseModel):
    id: int
    meeting_id: int
    speaker: str
    start_time: float
    end_time: float
    text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
