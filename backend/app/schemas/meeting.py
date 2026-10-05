from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _clean_title(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Title cannot be empty")
    return cleaned


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    meeting_date: datetime | None = None
    duration_seconds: int | None = Field(default=None, ge=0)
    platform: str | None = Field(default=None, max_length=100)
    status: str | None = Field(default=None, max_length=50)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        return _clean_title(value)


class MeetingUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None
    meeting_date: datetime | None = None
    duration_seconds: int | None = Field(default=None, ge=0)
    platform: str | None = Field(default=None, max_length=100)
    status: str | None = Field(default=None, max_length=50)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _clean_title(value)

    @model_validator(mode="after")
    def title_cannot_be_null(self):
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("Title cannot be empty")
        return self


class MeetingResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: str | None
    meeting_date: datetime
    duration_seconds: int
    platform: str
    status: str
    recording_path: str | None
    summary: str | None
    key_points: list | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
