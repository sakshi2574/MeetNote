from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from app.db.database import SessionLocal
from app.models.meeting import Meeting
from app.models.transcript_segment import TranscriptSegment
from app.services import transcription_service
from app.services.transcription_service import EmptyTranscription

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
    return (
        iter(SimpleNamespace(text=text, start=0.5, end=2.75) for text in texts),
        SimpleNamespace(language="en", duration=3.0),
    )


def install_whisper(monkeypatch, model_cls):
    monkeypatch.setattr(transcription_service, "_whisper_model", None)
    monkeypatch.setattr(transcription_service, "WhisperModel", model_cls)


@pytest.fixture(autouse=True)
def reset_transcription_claim():
    transcription_service._transcription_owner = None
    yield
    transcription_service._transcription_owner = None


class FakeWhisperModel:
    def __init__(self, model_size_or_path, device, compute_type):
        assert model_size_or_path == "small"
        assert device == "cpu"
        assert compute_type == "int8"
        self.audio_paths: list[Path] = []

    def transcribe(self, audio, **kwargs):
        assert kwargs.get("word_timestamps") is False
        self.audio_paths.append(Path(audio))
        return segments_result("Discussed the launch plan.")


class FailingWhisperModel:
    def __init__(self, model_size_or_path, device, compute_type):
        assert model_size_or_path == "small"
        assert device == "cpu"
        assert compute_type == "int8"

    def transcribe(self, audio, **kwargs):
        assert kwargs.get("word_timestamps") is False
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
    real = transcription_service.transcribe_recording

    class RecordingWhisperModel(FakeWhisperModel):
        def __init__(self, model_size_or_path, device, compute_type):
            super().__init__(model_size_or_path, device, compute_type)
            created.append(self)

    def spy(recording_path):
        calls["path"] = Path(recording_path)
        return real(recording_path)

    install_whisper(monkeypatch, RecordingWhisperModel)
    monkeypatch.setattr("app.services.transcription_jobs.transcribe_recording", spy)

    response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert response.status_code == 200
    body = response.json()
    assert body["meeting_id"] == meeting_id
    assert body["text"] == "Discussed the launch plan."
    assert body["language"] == "en"
    assert len(body["segments"]) == 1
    saved = body["segments"][0]
    assert saved["meeting_id"] == meeting_id
    assert saved["speaker"] == "Unknown"
    assert saved["source"] == "ai"
    assert saved["start_time"] == 0.5
    assert saved["end_time"] == 2.75
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


def test_segment_times_come_from_whisper_not_meeting_duration(client, recordings_dir, monkeypatch):
    user_id, token = register_and_login(client, "Owner", "owner-transcribe-zero@example.com")
    (recordings_dir / "zero-duration.webm").write_bytes(AUDIO)
    meeting_id = add_meeting(user_id, "Zero duration", "recordings/zero-duration.webm")
    install_whisper(monkeypatch, FakeWhisperModel)

    response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert response.status_code == 200, response.text
    saved = response.json()["segments"][0]
    assert saved["start_time"] == 0.5
    assert saved["end_time"] == 2.75
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
            assert kwargs.get("word_timestamps") is False
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
    assert replaced["start_time"] == 0.5
    assert replaced["end_time"] == 2.75
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
            assert kwargs.get("word_timestamps") is False
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

    monkeypatch.setattr("app.services.transcription_jobs.replace_generated_transcript", boom)
    with caplog.at_level("DEBUG"):
        response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert response.status_code == 500
    assert response.json()["detail"] == "Transcript could not be saved"
    assert INTERNAL_ERROR not in response.text
    assert INTERNAL_ERROR not in caplog.text
    assert transcript_count(meeting_id) == 0


def test_whisper_segments_keep_their_own_timestamps(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-transcribe-cues@example.com")
    meeting_id = upload_recording(client, token, "owner-transcribe-cues")

    class TimedWhisperModel(FakeWhisperModel):
        def transcribe(self, audio, **kwargs):
            assert kwargs.get("word_timestamps") is False
            return (
                iter(
                    [
                        SimpleNamespace(text="  Hello   team. ", start=1.25, end=2.5),
                        SimpleNamespace(text="   ", start=2.5, end=3.0),
                        SimpleNamespace(text="Missing times"),
                        SimpleNamespace(text="Backwards.", start=4.0, end=3.0),
                        SimpleNamespace(text="We shipped it.", start=0.0, end=1.2),
                        SimpleNamespace(text="Clamped.", start=-0.4, end=0.2),
                    ]
                ),
                SimpleNamespace(language=" en "),
            )

    install_whisper(monkeypatch, TimedWhisperModel)
    response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["language"] == "en"
    assert body["text"] == "Clamped. We shipped it. Hello team."
    assert [(row["start_time"], row["end_time"], row["text"]) for row in body["segments"]] == [
        (0.0, 0.2, "Clamped."),
        (0.0, 1.2, "We shipped it."),
        (1.25, 2.5, "Hello team."),
    ]
    assert all(row["speaker"] == "Unknown" for row in body["segments"])
    assert all(row["source"] == "ai" for row in body["segments"])
    assert transcript_count(meeting_id) == 3


def test_empty_transcription_is_not_a_decoder_failure(client, monkeypatch, caplog):
    _, token = register_and_login(client, "Owner", "owner-transcribe-silent@example.com")
    meeting_id = upload_recording(client, token, "owner-transcribe-silent")
    manual = client.post(
        f"/meetings/{meeting_id}/transcript",
        headers=auth_header(token),
        json={"speaker": "Alex", "start_time": 0, "end_time": 1, "text": "Typed by hand."},
    )
    assert manual.status_code == 201, manual.text

    class SilentWhisperModel(FakeWhisperModel):
        def transcribe(self, audio, **kwargs):
            assert kwargs.get("word_timestamps") is False
            return iter([SimpleNamespace(text="   ", start=0.0, end=1.0)]), SimpleNamespace(language="en")

    install_whisper(monkeypatch, SilentWhisperModel)
    with caplog.at_level("DEBUG"):
        response = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert response.status_code == 422
    assert response.json()["detail"] == "No speech was detected"
    assert "Local transcription failed" not in caplog.text
    assert transcript_count(meeting_id) == 1
    transcript = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token))
    assert transcript.json()[0]["text"] == "Typed by hand."
    assert transcript.json()[0]["source"] == "manual"


def test_edited_generated_segment_survives_retranscription(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-transcribe-edit@example.com")
    meeting_id = upload_recording(client, token, "owner-transcribe-edit")
    texts = ["Discussed the launch plan.", "Revised the launch plan."]

    class SequenceWhisperModel(FakeWhisperModel):
        def transcribe(self, audio, **kwargs):
            assert kwargs.get("word_timestamps") is False
            return segments_result(texts.pop(0))

    install_whisper(monkeypatch, SequenceWhisperModel)
    first = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))
    assert first.status_code == 200, first.text
    segment_id = first.json()["segments"][0]["id"]

    edited = client.put(
        f"/transcript/{segment_id}",
        headers=auth_header(token),
        json={"text": "Corrected by hand."},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["source"] == "manual"
    assert edited.json()["start_time"] == 0.5
    assert edited.json()["end_time"] == 2.75

    second = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))
    assert second.status_code == 200, second.text
    transcript = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token))
    rows = transcript.json()
    texts_saved = [row["text"] for row in rows]
    assert "Discussed the launch plan." not in texts_saved
    assert "Corrected by hand." in texts_saved
    assert "Revised the launch plan." in texts_saved
    kept = next(row for row in rows if row["id"] == segment_id)
    assert kept["source"] == "manual"
    assert kept["text"] == "Corrected by hand."
    generated = next(row for row in rows if row["source"] == "ai")
    assert generated["text"] == "Revised the launch plan."
    assert generated["id"] != segment_id


def test_transcription_already_in_progress_returns_409(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-transcribe-busy@example.com")
    meeting_id = upload_recording(client, token, "owner-transcribe-busy")
    other_id = upload_recording(client, token, "owner-transcribe-busy-other")
    install_whisper(monkeypatch, FakeWhisperModel)
    assert transcription_service.claim_transcription(meeting_id) is True
    try:
        same = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))
        other = client.post(f"/meetings/{other_id}/transcribe", headers=auth_header(token))
    finally:
        transcription_service.release_transcription(meeting_id)

    assert same.status_code == 409
    assert same.json()["detail"] == "Transcription is already in progress"
    assert other.status_code == 409
    assert transcript_count(meeting_id) == 0
    assert transcript_count(other_id) == 0

    retried = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))
    assert retried.status_code == 200, retried.text


def test_speech_cues_reject_recordings_with_no_timed_speech():
    with pytest.raises(EmptyTranscription):
        transcription_service._speech_cues(
            [SimpleNamespace(text="No times here")],
            SimpleNamespace(language="en"),
        )
