import atexit
import os
import shutil
import tempfile
from pathlib import Path

# Isolate tests from the development SQLite file before the app engine is created.
_TEST_ROOT = Path(tempfile.mkdtemp(prefix="meetnote-playback-"))
os.environ["DATABASE_URL"] = "sqlite:///" + (_TEST_ROOT / "meetnote.db").resolve().as_posix()

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.database import engine
from app.main import app
from app.services import recording_service

if "meetnote-playback-" not in settings.database_url:
    raise RuntimeError("Playback tests must use a temporary database")


def _cleanup_test_database() -> None:
    engine.dispose()
    shutil.rmtree(_TEST_ROOT, ignore_errors=True)


atexit.register(_cleanup_test_database)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def recordings_dir(tmp_path, monkeypatch):
    directory = tmp_path / "uploads" / "recordings"
    directory.mkdir(parents=True)
    monkeypatch.setattr(recording_service, "RECORDINGS_DIR", directory)
    return directory
