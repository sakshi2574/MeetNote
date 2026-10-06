from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from app.db.database import SessionLocal
from app.models.meeting import Meeting
from app.models.transcript_segment import TranscriptSegment
from app.routers import transcriptions as transcriptions_router
from app.services import transcription_service

AUDIO = b"webm-audio-bytes"
INTERNAL_ERROR = "local decoder failed: internal-detail-do-not-leak"


def register_and_login(client: TestClient, name: str, email: str) -> tuple[int, str]:
    registered = client.post(
        "/auth/register",
        json={"name": name, "email": email, "password": "password123"},
    )
    assert registered.status_code == 201, registered.text
    logged_in = client.post(
        "/auth/login",
        json={"email": email, "password": "password123"},
    )
    assert logged_in.status_code == 200, logged_in.text
    return registered.json()["id"], logged_in.json()["access_token"]


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def upload_recording(client: TestClient, token: str, meeting_code: str) -> int:
    response = client.post(
        "/recordings/upload",
        headers=auth_header(token),
        data={"meeting_code": meeting_code, "duration_seconds": "3"},
        files={"file": ("clip.webm", AUDIO, "audio/webm")},
    )
    assert response.status_code == 201, response.text
    return response.json()["meeting_id"]


def add_meeting(user_id: int, title: str, recording_path: str | None) -> int:
    db = SessionLocal()
    try:
        meeting = Meeting(user_id=user_id, title=title, recording_path=recording_path)
        db.add(meeting)
        db.commit()
        db.refresh(meeting)
        return meeting.id
    finally:
        db.close()


def transcript_count(meeting_id: int) -> int:
    db = SessionLocal()
    try:
        statement = (
            select(func.count())
            .select_from(TranscriptSegment)
            .where(TranscriptSegment.meeting_id == meeting_id)
        )
        return int(db.scalar(statement) or 0)
    finally:
        db.close()


def saved_segment(meeting_id: int) -> TranscriptSegment:
    db = SessionLocal()
    try:
        segment = db.scalar(
            select(TranscriptSegment).where(TranscriptSegment.meeting_id == meeting_id)
        )
        db.expunge(segment)
        return segment
    finally:
        db.close()


def segments_result(*texts: str):
    return iter(SimpleNamespace(text=text) for text in texts), SimpleNamespace()


def install_whisper(monkeypatch, model_cls):
    monkeypatch.setattr(transcription_service, "_whisper_model", None)
    monkeypatch.setattr(transcription_service, "WhisperModel", model_cls)


class FakeWhisperModel:
    def __init__(self, model_size_or_path, device, compute_type):
        assert model_size_or_path == "small"
        assert device == "cpu"
        assert compute_type == "int8"
        self.audio_paths: list[Path] = []

    def transcribe(self, audio, **kwargs):
        self.audio_paths.append(Path(audio))
        return segments_result("Discussed the launch plan.")


class FailingWhisperModel:
    def __init__(self, model_size_or_path, device, compute_type):
        assert model_size_or_path == "small"
        assert device == "cpu"
        assert compute_type == "int8"

    def transcribe(self, audio, **kwargs):
        raise RuntimeError(INTERNAL_ERROR)


def test_unauthenticated_request_returns_401(client):
    response = client.post("/meetings/1/transcribe")

    assert response.status_code == 401
    assert response.json()["detail"] == "Could not validate credentials"


def test_another_users_meeting_returns_404(client):
    _, owner_token = register_and_login(client, "Owner", "owner-transcribe-private@example.com")
    _, other_token = register_and_login(client, "Other", "other-transcribe-private@example.com")
    meeting_id = upload_recording(client, owner_token, "owner-transcribe-private")

    response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(other_token))

    assert response.status_code == 404
    assert response.json()["detail"] == "Meeting not found"
    assert transcript_count(meeting_id) == 0


def test_meeting_without_recording_returns_404(client):
    _, token = register_and_login(client, "Owner", "owner-transcribe-empty@example.com")
    created = client.post(
        "/meetings",
        headers=auth_header(token),
        json={"title": "No recording"},
    )
    assert created.status_code == 201, created.text
    meeting_id = created.json()["id"]

    response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert response.status_code == 404
    assert response.json()["detail"] == "Recording not found"
    assert transcript_count(meeting_id) == 0


def test_missing_recording_file_returns_404(client, recordings_dir):
    user_id, token = register_and_login(client, "Owner", "owner-transcribe-missing@example.com")
    meeting_id = add_meeting(user_id, "Missing file", "recordings/does-not-exist.webm")
    assert not (recordings_dir / "does-not-exist.webm").exists()

    response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert response.status_code == 404
    assert response.json()["detail"] == "Recording not found"


def test_valid_recording_uses_local_whisper(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-transcribe-ok@example.com")
    meeting_id = upload_recording(client, token, "owner-transcribe-ok")
    calls: dict[str, Path] = {}
    created: list[FakeWhisperModel] = []
    real = transcriptions_router.transcribe_recording

    class RecordingWhisperModel(FakeWhisperModel):
        def __init__(self, model_size_or_path, device, compute_type):
            super().__init__(model_size_or_path, device, compute_type)
            created.append(self)

    def spy(recording_path):
        calls["path"] = Path(recording_path)
        return real(recording_path)

    install_whisper(monkeypatch, RecordingWhisperModel)
    monkeypatch.setattr(transcriptions_router, "transcribe_recording", spy)

    response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert response.status_code == 200
    body = response.json()
    assert body["meeting_id"] == meeting_id
    assert body["text"] == "Discussed the launch plan."
    assert len(body["segments"]) == 1
    saved = body["segments"][0]
    assert saved["meeting_id"] == meeting_id
    assert saved["speaker"] == "Unknown"
    assert saved["start_time"] == 0
    assert saved["end_time"] == 3
    assert saved["text"] == "Discussed the launch plan."
    assert calls["path"].is_file()
    assert calls["path"].read_bytes() == AUDIO
    assert calls["path"].suffix == ".webm"
    assert len(created) == 1
    assert created[0].audio_paths == [calls["path"]]
    assert transcript_count(meeting_id) == 1
    stored = saved_segment(meeting_id)
    assert stored.source == "ai"
    assert stored.speaker == "Unknown"
    assert stored.text == "Discussed the launch plan."

    transcript = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token))
    assert transcript.status_code == 200
    assert transcript.json() == body["segments"]


def test_transcription_failure_does_not_expose_internal_error(client, monkeypatch, caplog):
    _, token = register_and_login(client, "Owner", "owner-transcribe-fail@example.com")
    meeting_id = upload_recording(client, token, "owner-transcribe-fail")
    install_whisper(monkeypatch, FailingWhisperModel)

    with caplog.at_level("DEBUG"):
        response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert response.status_code == 502
    assert response.json()["detail"] == "Transcription failed"
    assert INTERNAL_ERROR not in response.text
    assert "Local transcription failed: RuntimeError: local decoder failed:" in caplog.text
    assert transcript_count(meeting_id) == 0


def test_transcription_service_reports_missing_file():
    with pytest.raises(FileNotFoundError):
        transcription_service.transcribe_recording(Path("missing-recording.webm"))


def test_zero_duration_segment_ends_at_zero(client, recordings_dir, monkeypatch):
    user_id, token = register_and_login(client, "Owner", "owner-transcribe-zero@example.com")
    (recordings_dir / "zero-duration.webm").write_bytes(AUDIO)
    meeting_id = add_meeting(user_id, "Zero duration", "recordings/zero-duration.webm")
    install_whisper(monkeypatch, FakeWhisperModel)

    response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert response.status_code == 200, response.text
    saved = response.json()["segments"][0]
    assert saved["start_time"] == 0
    assert saved["end_time"] == 0
    assert saved["text"] == "Discussed the launch plan."


def test_repeated_transcription_replaces_generated_segment_only(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-transcribe-repeat@example.com")
    meeting_id = upload_recording(client, token, "owner-transcribe-repeat")
    manual = client.post(
        f"/meetings/{meeting_id}/transcript",
        headers=auth_header(token),
        json={
            "speaker": "Unknown",
            "start_time": 0,
            "end_time": 3,
            "text": "Typed by hand.",
        },
    )
    assert manual.status_code == 201, manual.text
    manual_id = manual.json()["id"]
    texts = ["Discussed the launch plan.", "Revised the launch plan."]
    created: list[FakeWhisperModel] = []

    class SequenceWhisperModel(FakeWhisperModel):
        def __init__(self, model_size_or_path, device, compute_type):
            super().__init__(model_size_or_path, device, compute_type)
            created.append(self)

        def transcribe(self, audio, **kwargs):
            self.audio_paths.append(Path(audio))
            return segments_result(texts.pop(0))

    install_whisper(monkeypatch, SequenceWhisperModel)

    first = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))
    second = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert len(created) == 1
    assert second.json()["text"] == "Revised the launch plan."
    assert len(second.json()["segments"]) == 1
    replaced = second.json()["segments"][0]
    assert replaced["id"] != first.json()["segments"][0]["id"]
    assert replaced["meeting_id"] == meeting_id
    assert replaced["text"] == "Revised the launch plan."
    assert replaced["start_time"] == 0
    assert replaced["end_time"] == 3
    assert transcript_count(meeting_id) == 2

    transcript = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token))
    assert transcript.status_code == 200
    rows = transcript.json()
    assert [row["text"] for row in rows].count("Revised the launch plan.") == 1
    assert "Discussed the launch plan." not in [row["text"] for row in rows]
    kept = next(row for row in rows if row["id"] == manual_id)
    assert kept["text"] == "Typed by hand."
    assert kept["speaker"] == "Unknown"


def test_transcription_failure_keeps_existing_transcript(client, monkeypatch, caplog):
    _, token = register_and_login(client, "Owner", "owner-transcribe-keep@example.com")
    meeting_id = upload_recording(client, token, "owner-transcribe-keep")
    calls = {"count": 0}

    class FlakyWhisperModel(FakeWhisperModel):
        def transcribe(self, audio, **kwargs):
            calls["count"] += 1
            if calls["count"] > 1:
                raise RuntimeError(INTERNAL_ERROR)
            return segments_result("Discussed the launch plan.")

    install_whisper(monkeypatch, FlakyWhisperModel)
    created = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))
    assert created.status_code == 200, created.text
    saved_id = created.json()["segments"][0]["id"]

    with caplog.at_level("DEBUG"):
        failed = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert failed.status_code == 502
    assert failed.json()["detail"] == "Transcription failed"
    assert INTERNAL_ERROR not in failed.text
    assert transcript_count(meeting_id) == 1
    transcript = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token))
    assert transcript.json()[0]["id"] == saved_id
    assert transcript.json()[0]["text"] == "Discussed the launch plan."


def test_database_failure_does_not_expose_internal_error(client, monkeypatch, caplog):
    _, token = register_and_login(client, "Owner", "owner-transcribe-db@example.com")
    meeting_id = upload_recording(client, token, "owner-transcribe-db")
    install_whisper(monkeypatch, FakeWhisperModel)

    def boom(_db, _meeting, _text):
        raise SQLAlchemyError(INTERNAL_ERROR)

    monkeypatch.setattr(transcriptions_router, "replace_generated_transcript", boom)
    with caplog.at_level("DEBUG"):
        response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert response.status_code == 500
    assert response.json()["detail"] == "Transcript could not be saved"
    assert INTERNAL_ERROR not in response.text
    assert INTERNAL_ERROR not in caplog.text
    assert transcript_count(meeting_id) == 0
