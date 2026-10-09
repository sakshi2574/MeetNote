from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.models.mixins import created_at_column, updated_at_column, utcnow


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    meeting_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    platform: Mapped[str] = mapped_column(String(100), nullable=False, default="MeetNote Recorder")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="completed")
    meeting_code: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    recording_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    transcription_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    transcription_language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    transcription_error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_points: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # "ai" when the summary came from transcript extraction, "manual" after a
    # user edit. A summary with no source predates this field and is kept.
    summary_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    intelligence_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    intelligence_error: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    user: Mapped[User] = relationship(back_populates="meetings")
    transcript_segments: Mapped[list[TranscriptSegment]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    action_items: Mapped[list[ActionItem]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    decisions: Mapped[list[Decision]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
