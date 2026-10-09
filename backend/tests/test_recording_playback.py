from fastapi.testclient import TestClient

from app.db.database import SessionLocal
from app.models.meeting import Meeting

AUDIO = b"webm-audio-bytes"
SECRET = b"SECRET_MARKER"


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


def upload_recording(client: TestClient, token: str, meeting_code: str) -> tuple[int, bytes]:
    response = client.post(
        "/recordings/upload",
        headers=auth_header(token),
        data={"meeting_code": meeting_code, "duration_seconds": "3"},
        files={"file": ("clip.webm", AUDIO, "audio/webm")},
    )
    assert response.status_code == 201, response.text
    return response.json()["meeting_id"], AUDIO


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


def test_owner_can_retrieve_recording(client, recordings_dir):
    _, token = register_and_login(client, "Owner", "owner-playback@example.com")
    meeting_id, audio = upload_recording(client, token, "owner-playback")
    stored_files = list(recordings_dir.glob("*.webm"))
    assert len(stored_files) == 1

    response = client.get(f"/meetings/{meeting_id}/recording", headers=auth_header(token))

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/webm")
    assert response.headers["content-disposition"].startswith("inline;")
    assert response.content == audio
    assert response.content == stored_files[0].read_bytes()


def test_unauthenticated_request_returns_401(client):
    _, token = register_and_login(client, "Owner", "owner-unauth@example.com")
    meeting_id, _ = upload_recording(client, token, "owner-unauth")

    response = client.get(f"/meetings/{meeting_id}/recording")

    assert response.status_code == 401
    assert response.json()["detail"] == "Could not validate credentials"
    assert response.headers["www-authenticate"].lower().startswith("bearer")


def test_another_user_cannot_retrieve_recording(client):
    _, owner_token = register_and_login(client, "Owner", "owner-private@example.com")
    _, other_token = register_and_login(client, "Other", "other-private@example.com")
    meeting_id, audio = upload_recording(client, owner_token, "owner-private")

    response = client.get(f"/meetings/{meeting_id}/recording", headers=auth_header(other_token))

    assert response.status_code == 404
    assert response.json()["detail"] == "Meeting not found"
    assert response.content != audio


def test_missing_meeting_returns_404(client):
    _, token = register_and_login(client, "Owner", "owner-missing-meeting@example.com")

    response = client.get("/meetings/999999/recording", headers=auth_header(token))

    assert response.status_code == 404
    assert response.json()["detail"] == "Meeting not found"


def test_meeting_without_recording_returns_404(client):
    _, token = register_and_login(client, "Owner", "owner-empty@example.com")
    created = client.post(
        "/meetings",
        headers=auth_header(token),
        json={"title": "No recording"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["recording_path"] is None

    response = client.get(
        f"/meetings/{created.json()['id']}/recording",
        headers=auth_header(token),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Recording not found"


def test_missing_recording_file_returns_404(client, recordings_dir):
    user_id, token = register_and_login(client, "Owner", "owner-missing-file@example.com")
    meeting_id = add_meeting(user_id, "Missing file", "recordings/does-not-exist.webm")
    assert not (recordings_dir / "does-not-exist.webm").exists()

    response = client.get(f"/meetings/{meeting_id}/recording", headers=auth_header(token))

    assert response.status_code == 404
    assert response.json()["detail"] == "Recording not found"


def test_video_webm_upload_is_served_as_video(client):
    _, token = register_and_login(client, "Owner", "owner-video@example.com")
    video = b"\x1a\x45\xdf\xa3" + b"V_VP9" + b"A_OPUS"
    response = client.post(
        "/recordings/upload",
        headers=auth_header(token),
        data={"meeting_code": "owner-video", "duration_seconds": "8"},
        files={"file": ("clip.webm", video, "video/webm")},
    )
    assert response.status_code == 201, response.text
    meeting_id = response.json()["meeting_id"]

    playback = client.get(f"/meetings/{meeting_id}/recording", headers=auth_header(token))

    assert playback.status_code == 200
    assert playback.headers["content-type"].startswith("video/webm")
    assert playback.content == video


def test_video_codec_recording_is_video_even_when_upload_said_audio(client):
    _, token = register_and_login(client, "Owner", "owner-mislabeled-video@example.com")
    video = b"webm-header" + b"V_VP8" + b"audio"
    response = client.post(
        "/recordings/upload",
        headers=auth_header(token),
        data={"meeting_code": "owner-mislabeled", "duration_seconds": "4"},
        files={"file": ("clip.webm", video, "audio/webm")},
    )
    assert response.status_code == 201, response.text

    playback = client.get(
        f"/meetings/{response.json()['meeting_id']}/recording",
        headers=auth_header(token),
    )

    assert playback.status_code == 200
    assert playback.headers["content-type"].startswith("video/webm")


def test_video_webm_codecs_parameter_is_accepted(client):
    _, token = register_and_login(client, "Owner", "owner-codecs@example.com")
    response = client.post(
        "/recordings/upload",
        headers=auth_header(token),
        data={"meeting_code": "owner-codecs", "duration_seconds": "2"},
        files={"file": ("clip.webm", b"webm-audio-bytes", "video/webm;codecs=vp9,opus")},
    )

    assert response.status_code == 201, response.text


def test_codec_marker_after_cluster_does_not_mark_audio_as_video(client):
    _, token = register_and_login(client, "Owner", "owner-cluster-audio@example.com")
    cluster = b"\x1f\x43\xb6\x75"
    audio = b"\x1a\x45\xdf\xa3" + b"A_OPUS" + cluster + (b"V_VP9" * 8)
    response = client.post(
        "/recordings/upload",
        headers=auth_header(token),
        data={"meeting_code": "owner-cluster-audio", "duration_seconds": "5"},
        files={"file": ("clip.webm", audio, "audio/webm")},
    )
    assert response.status_code == 201, response.text

    playback = client.get(
        f"/meetings/{response.json()['meeting_id']}/recording",
        headers=auth_header(token),
    )

    assert playback.status_code == 200
    assert playback.headers["content-type"].startswith("audio/webm")
    assert playback.content == audio


def test_video_codec_before_first_cluster_is_served_as_video(client):
    _, token = register_and_login(client, "Owner", "owner-cluster-video@example.com")
    cluster = b"\x1f\x43\xb6\x75"
    video = b"\x1a\x45\xdf\xa3" + b"V_VP9" + cluster + b"A_OPUS"
    response = client.post(
        "/recordings/upload",
        headers=auth_header(token),
        data={"meeting_code": "owner-cluster-video", "duration_seconds": "5"},
        files={"file": ("clip.webm", video, "audio/webm")},
    )
    assert response.status_code == 201, response.text

    playback = client.get(
        f"/meetings/{response.json()['meeting_id']}/recording",
        headers=auth_header(token),
    )

    assert playback.status_code == 200
    assert playback.headers["content-type"].startswith("video/webm")


def test_non_webm_upload_is_rejected(client):
    _, token = register_and_login(client, "Owner", "owner-mp4@example.com")
    response = client.post(
        "/recordings/upload",
        headers=auth_header(token),
        data={"meeting_code": "owner-mp4", "duration_seconds": "2"},
        files={"file": ("clip.mp4", b"not-webm", "video/mp4")},
    )

    assert response.status_code == 415
    assert response.json()["detail"] == "Only WebM recordings are accepted"


def test_path_traversal_cannot_access_files_outside_recordings_directory(client, recordings_dir):
    secret = recordings_dir.parent / "outside.webm"
    secret.write_bytes(SECRET)
    user_id, token = register_and_login(client, "Owner", "owner-traversal@example.com")
    outside_paths = [
        "../outside.webm",
        "recordings/../outside.webm",
        str(secret.resolve()),
    ]

    for recording_path in outside_paths:
        meeting_id = add_meeting(user_id, "Traversal", recording_path)
        response = client.get(f"/meetings/{meeting_id}/recording", headers=auth_header(token))
        assert response.status_code == 404, recording_path
        assert response.json()["detail"] == "Recording not found"
        assert SECRET not in response.content
