from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _required_text(value: str, label: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{label} cannot be empty")
    return cleaned


class DecisionCreate(BaseModel):
    decision: str = Field(min_length=1)
    timestamp: float | None = Field(default=None, ge=0)
    context: str | None = None

    @field_validator("decision")
    @classmethod
    def decision_not_blank(cls, value: str) -> str:
        return _required_text(value, "Decision")

    @field_validator("context")
    @classmethod
    def clean_context(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class DecisionUpdate(BaseModel):
    decision: str | None = None
    timestamp: float | None = Field(default=None, ge=0)
    context: str | None = None

    @field_validator("decision")
    @classmethod
    def decision_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _required_text(value, "Decision")

    @field_validator("context")
    @classmethod
    def clean_context(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def required_fields_cannot_be_null(self):
        if "decision" in self.model_fields_set and self.decision is None:
            raise ValueError("Decision cannot be empty")
        if "timestamp" in self.model_fields_set and self.timestamp is None:
            raise ValueError("timestamp cannot be negative")
        return self


class DecisionResponse(BaseModel):
    id: int
    meeting_id: int
    decision: str
    timestamp: float
    context: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
