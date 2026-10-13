
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    database_url: str = "sqlite:///./meetnote.db"

    jwt_secret_key: str = "replace-with-a-long-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    frontend_url: str = "http://localhost:5173"

    # Gemini AI
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"

    # Google Calendar OAuth
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = (
        "http://localhost:8000/calendar/google/callback"
    )

    # Encryption key for Google OAuth tokens
    google_token_encryption_key: str | None = None

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
