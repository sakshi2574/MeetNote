import threading
import time

from fastapi.testclient import TestClient

from app.db.database import SessionLocal
from app.models.meeting import Meeting
from app.services import transcription_jobs
from app.services.transcription_jobs import RESTART_ERROR
from app.services.transcription_service import TranscriptCue, TranscriptionResult
from tests.test_transcription import (
    AUDIO,
    auth_header,
    register_and_login,
    transcript_count,
    upload_recording,
)

_real_enqueue = transcription_jobs.enqueue_transcription


def recording_path(meeting_id: int) -> str:
    db = SessionLocal()
    try:
        meeting = db.get(Meeting, meeting_id)
        assert meeting is not None
        assert meeting.recording_path
        return meeting.recording_path
    finally:
        db.close()


def test_upload_schedules_transcription_and_returns_first(client, capture_transcription_jobs):
    _, token = register_and_login(client, "Owner", "owner-auto-schedule@example.com")
    started = time.perf_counter()
    meeting_id = upload_recording(client, token, "owner-auto-schedule")
    elapsed = time.perf_counter() - started

    assert elapsed < 2
    assert transcript_count(meeting_id) == 0
    assert capture_transcription_jobs == [(meeting_id, recording_path(meeting_id))]
    status = client.get(f"/meetings/{meeting_id}/transcription", headers=auth_header(token))
    assert status.status_code == 200, status.text
    assert status.json()["status"] == "pending"
    assert status.json()["segment_count"] == 0
    assert status.json()["language"] is None
    assert status.json()["error"] is None


def test_upload_returns_while_transcription_is_still_running(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-auto-wait@example.com")
    started = threading.Event()
    release = threading.Event()

    def blocked(_path):
        started.set()
        assert release.wait(5)
        return TranscriptionResult(
            text="Hello team.",
            segments=(TranscriptCue(text="Hello team.", start=0.2, end=1.4),),
            language="en",
        )

    monkeypatch.setattr(transcription_jobs, "transcribe_recording", blocked)
    monkeypatch.setattr("app.routers.recordings.enqueue_transcription", _real_enqueue)
    response = client.post(
        "/recordings/upload",
        headers=auth_header(token),
        data={"meeting_code": "owner-auto-wait", "duration_seconds": "3"},
        files={"file": ("clip.webm", AUDIO, "audio/webm")},
    )
    assert response.status_code == 201, response.text
    assert started.wait(5)
    meeting_id = response.json()["meeting_id"]
    in_progress = client.get(f"/meetings/{meeting_id}/transcription", headers=auth_header(token))
    assert in_progress.json()["status"] in {"pending", "processing"}
    release.set()

    completed = None
    for _ in range(50):
        current = client.get(f"/meetings/{meeting_id}/transcription", headers=auth_header(token))
        if current.json()["status"] == "completed":
            completed = current.json()
            break
        time.sleep(0.05)
    assert completed is not None
    assert completed["language"] == "en"
    assert completed["segment_count"] == 1
    assert completed["error"] is None
    transcript = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token))
    assert transcript.json()[0]["text"] == "Hello team."
    assert transcript.json()[0]["start_time"] == 0.2
    assert transcript.json()[0]["end_time"] == 1.4
    assert transcript.json()[0]["speaker"] == "Unknown"


def test_duplicate_upload_updates_the_same_meeting(client, capture_transcription_jobs):
    _, token = register_and_login(client, "Owner", "owner-auto-dup-meeting@example.com")
    first = upload_recording(client, token, "owner-auto-dup-meeting")
    second = upload_recording(client, token, "owner-auto-dup-meeting")

    assert first == second
    assert len(capture_transcription_jobs) == 2
    assert {item[0] for item in capture_transcription_jobs} == {first}
    assert capture_transcription_jobs[0][1] != capture_transcription_jobs[1][1]


def test_same_recording_is_not_queued_twice(monkeypatch):
    transcription_jobs.reset_transcription_state()
    transcription_jobs.start_transcription_jobs()
    monkeypatch.setattr(transcription_jobs, "_ensure_worker_locked", lambda: None)

    assert _real_enqueue(41, "recordings/same.webm") is True
    assert _real_enqueue(41, "recordings/same.webm") is False
    assert _real_enqueue(41, "recordings/newer.webm") is True
    assert list(transcription_jobs._queue) == [(41, "recordings/newer.webm")]


def test_retry_while_pending_does_not_schedule_another_job(client, capture_transcription_jobs):
    _, token = register_and_login(client, "Owner", "owner-auto-retry-pending@example.com")
    meeting_id = upload_recording(client, token, "owner-auto-retry-pending")
    retry = client.post(f"/meetings/{meeting_id}/transcription/retry", headers=auth_header(token))

    assert retry.status_code == 200, retry.text
    assert retry.json()["status"] == "pending"
    assert len(capture_transcription_jobs) == 1


def test_retry_after_failure_schedules_one_job(client, capture_transcription_jobs):
    _, token = register_and_login(client, "Owner", "owner-auto-retry-failed@example.com")
    meeting_id = upload_recording(client, token, "owner-auto-retry-failed")
    db = SessionLocal()
    try:
        meeting = db.get(Meeting, meeting_id)
        meeting.transcription_status = "failed"
        meeting.transcription_error = "Transcription failed."
        db.commit()
    finally:
        db.close()

    retry = client.post(f"/meetings/{meeting_id}/transcription/retry", headers=auth_header(token))
    assert retry.status_code == 200, retry.text
    assert retry.json()["status"] == "pending"
    assert retry.json()["error"] is None
    assert len(capture_transcription_jobs) == 2
    assert capture_transcription_jobs[-1][0] == meeting_id


def test_failed_transcription_stores_a_safe_error(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-auto-fail@example.com")
    meeting_id = upload_recording(client, token, "owner-auto-fail")
    manual = client.post(
        f"/meetings/{meeting_id}/transcript",
        headers=auth_header(token),
        json={"speaker": "Alex", "start_time": 0, "end_time": 1, "text": "Typed by hand."},
    )
    assert manual.status_code == 201, manual.text

    def boom(_path):
        raise RuntimeError(r"D:\secret\decoder.bin failed")

    monkeypatch.setattr(transcription_jobs, "transcribe_recording", boom)
    transcription_jobs.run_transcription_job(meeting_id, recording_path(meeting_id))
    status = client.get(f"/meetings/{meeting_id}/transcription", headers=auth_header(token))

    assert status.status_code == 200, status.text
    assert status.json()["status"] == "failed"
    assert status.json()["error"] == "Transcription failed."
    assert "secret" not in status.text
    assert "decoder" not in status.text
    assert status.json()["segment_count"] == 1
    transcript = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token))
    assert transcript.json()[0]["text"] == "Typed by hand."


def test_job_persists_segments_before_completed_status(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-auto-success@example.com")
    meeting_id = upload_recording(client, token, "owner-auto-success")
    seen = {}

    def fake(_path):
        db = SessionLocal()
        try:
            meeting = db.get(Meeting, meeting_id)
            seen["during"] = meeting.transcription_status
        finally:
            db.close()
        return TranscriptionResult(
            text="Hello team.",
            segments=(TranscriptCue(text="Hello team.", start=0.4, end=1.1),),
            language="en",
        )

    monkeypatch.setattr(transcription_jobs, "transcribe_recording", fake)
    transcription_jobs.run_transcription_job(meeting_id, recording_path(meeting_id))
    status = client.get(f"/meetings/{meeting_id}/transcription", headers=auth_header(token))

    assert seen["during"] == "processing"
    assert status.json()["status"] == "completed"
    assert status.json()["language"] == "en"
    assert status.json()["segment_count"] == 1
    assert transcript_count(meeting_id) == 1


def test_retranscription_preserves_manual_edits(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-auto-edit@example.com")
    meeting_id = upload_recording(client, token, "owner-auto-edit")
    texts = iter(["Discussed the launch.", "Revised the launch."])

    def fake(_path):
        text = next(texts)
        return TranscriptionResult(
            text=text,
            segments=(TranscriptCue(text=text, start=0.5, end=2.0),),
            language="en",
        )

    monkeypatch.setattr(transcription_jobs, "transcribe_recording", fake)
    path = recording_path(meeting_id)
    transcription_jobs.run_transcription_job(meeting_id, path)
    generated = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token)).json()[0]
    edited = client.put(
        f"/transcript/{generated['id']}",
        headers=auth_header(token),
        json={"text": "Corrected by hand."},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["source"] == "manual"

    transcription_jobs.run_transcription_job(meeting_id, path)
    rows = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token)).json()
    saved = [row["text"] for row in rows]
    assert "Corrected by hand." in saved
    assert "Revised the launch." in saved
    assert "Discussed the launch." not in saved
    assert sum(row["source"] == "ai" for row in rows) == 1


def test_restart_marks_interrupted_jobs_failed(client):
    _, token = register_and_login(client, "Owner", "owner-auto-restart@example.com")
    meeting_id = upload_recording(client, token, "owner-auto-restart")
    db = SessionLocal()
    try:
        meeting = db.get(Meeting, meeting_id)
        meeting.transcription_status = "processing"
        db.commit()
    finally:
        db.close()

    transcription_jobs.recover_interrupted_transcriptions()
    status = client.get(f"/meetings/{meeting_id}/transcription", headers=auth_header(token))
    assert status.json()["status"] == "failed"
    assert status.json()["error"] == RESTART_ERROR


def test_other_user_cannot_read_transcription_status(client):
    _, owner = register_and_login(client, "Owner", "owner-auto-private@example.com")
    _, other = register_and_login(client, "Other", "other-auto-private@example.com")
    meeting_id = upload_recording(client, owner, "owner-auto-private")

    response = client.get(f"/meetings/{meeting_id}/transcription", headers=auth_header(other))
    assert response.status_code == 404
    assert response.json()["detail"] == "Meeting not found"
    retry = client.post(f"/meetings/{meeting_id}/transcription/retry", headers=auth_header(other))
    assert retry.status_code == 404


def test_meeting_without_recording_has_no_transcription_status(client: TestClient):
    token = register_and_login(client, "Owner", "owner-auto-empty@example.com")[1]
    created = client.post("/meetings", headers=auth_header(token), json={"title": "No recording"})
    assert created.status_code == 201, created.text

    status = client.get(f"/meetings/{created.json()['id']}/transcription", headers=auth_header(token))
    assert status.status_code == 200, status.text
    assert status.json()["status"] is None
    assert status.json()["segment_count"] == 0
