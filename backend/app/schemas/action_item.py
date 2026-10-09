from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _required_text(value: str, label: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{label} cannot be empty")
    return cleaned


class ActionItemCreate(BaseModel):
    task: str = Field(min_length=1)
    assignee: str | None = Field(default=None, max_length=255)
    due_date: date | None = None
    status: str | None = Field(default=None, max_length=50)

    @field_validator("task")
    @classmethod
    def task_not_blank(cls, value: str) -> str:
        return _required_text(value, "Task")

    @field_validator("assignee")
    @classmethod
    def assignee_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _required_text(value, "Assignee")

    @field_validator("status")
    @classmethod
    def status_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _required_text(value, "Status")


class ActionItemUpdate(BaseModel):
    task: str | None = None
    assignee: str | None = Field(default=None, max_length=255)
    due_date: date | None = None
    status: str | None = Field(default=None, max_length=50)

    @field_validator("task")
    @classmethod
    def task_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _required_text(value, "Task")

    @field_validator("assignee")
    @classmethod
    def assignee_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _required_text(value, "Assignee")

    @field_validator("status")
    @classmethod
    def status_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _required_text(value, "Status")

    @model_validator(mode="after")
    def task_cannot_be_null(self):
        if "task" in self.model_fields_set and self.task is None:
            raise ValueError("Task cannot be empty")
        return self


class ActionItemResponse(BaseModel):
    id: int
    meeting_id: int
    task: str
    assignee: str | None
    due_date: date | None
    status: str
    timestamp: float | None = None
    source: str = "manual"
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
