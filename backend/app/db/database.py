from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    if not settings.database_url.startswith("sqlite"):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_meeting_code_column()
    _ensure_sqlite_transcript_source_column()


def _ensure_sqlite_meeting_code_column() -> None:
    # create_all creates missing tables only. An existing meetings table needs
    # the new column added in place so current SQLite databases keep working.
    if not settings.database_url.startswith("sqlite"):
        return

    with engine.begin() as connection:
        table = connection.execute(
            text("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meetings'")
        ).first()
        if table is None:
            return

        columns = {row[1] for row in connection.execute(text("PRAGMA table_info(meetings)"))}
        if "meeting_code" not in columns:
            connection.execute(text("ALTER TABLE meetings ADD COLUMN meeting_code VARCHAR(64)"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_meetings_meeting_code ON meetings (meeting_code)")
        )


def _ensure_sqlite_transcript_source_column() -> None:
    # Existing transcript rows were created by hand, so they default to manual.
    if not settings.database_url.startswith("sqlite"):
        return

    with engine.begin() as connection:
        table = connection.execute(
            text(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transcript_segments'"
            )
        ).first()
        if table is None:
            return

        columns = {
            row[1] for row in connection.execute(text("PRAGMA table_info(transcript_segments)"))
        }
        if "source" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE transcript_segments "
                    "ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'manual'"
                )
            )
