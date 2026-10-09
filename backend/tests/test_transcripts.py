from fastapi.testclient import TestClient


def register_and_login(client: TestClient, name: str, email: str) -> str:
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
    return logged_in.json()["access_token"]


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_transcript_crud_still_works(client):
    token = register_and_login(client, "Owner", "owner-transcript-crud@example.com")
    created_meeting = client.post(
        "/meetings",
        headers=auth_header(token),
        json={"title": "Transcript CRUD"},
    )
    assert created_meeting.status_code == 201, created_meeting.text
    meeting_id = created_meeting.json()["id"]

    created = client.post(
        f"/meetings/{meeting_id}/transcript",
        headers=auth_header(token),
        json={"speaker": "Alex", "start_time": 1, "end_time": 2, "text": "I will send the notes."},
    )
    assert created.status_code == 201, created.text
    assert created.json()["source"] == "manual"
    segment_id = created.json()["id"]

    listed = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token))
    assert listed.status_code == 200
    assert listed.json()[0]["text"] == "I will send the notes."

    updated = client.put(
        f"/transcript/{segment_id}",
        headers=auth_header(token),
        json={"text": "I will send the notes today."},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["text"] == "I will send the notes today."
    assert updated.json()["speaker"] == "Alex"

    deleted = client.delete(f"/transcript/{segment_id}", headers=auth_header(token))
    assert deleted.status_code == 200, deleted.text
    listed_again = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token))
    assert listed_again.json() == []


def test_speaker_field_stores_stable_labels(client):
    token = register_and_login(client, "Owner", "owner-speaker-labels@example.com")
    created_meeting = client.post(
        "/meetings",
        headers=auth_header(token),
        json={"title": "Speaker labels"},
    )
    meeting_id = created_meeting.json()["id"]

    created = client.post(
        f"/meetings/{meeting_id}/transcript",
        headers=auth_header(token),
        json={"speaker": "Speaker 2", "start_time": 4, "end_time": 5, "text": "A later voice."},
    )
    assert created.status_code == 201, created.text
    assert created.json()["speaker"] == "Speaker 2"
    first = client.post(
        f"/meetings/{meeting_id}/transcript",
        headers=auth_header(token),
        json={"speaker": "Speaker 1", "start_time": 1, "end_time": 2, "text": "The first voice."},
    )
    assert first.status_code == 201, first.text

    listed = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token))
    assert [row["speaker"] for row in listed.json()] == ["Speaker 1", "Speaker 2"]


def test_other_user_cannot_add_transcript_segment(client):
    owner = register_and_login(client, "Owner", "owner-transcript-private@example.com")
    other = register_and_login(client, "Other", "other-transcript-private@example.com")
    created_meeting = client.post(
        "/meetings",
        headers=auth_header(owner),
        json={"title": "Private transcript"},
    )
    meeting_id = created_meeting.json()["id"]

    response = client.post(
        f"/meetings/{meeting_id}/transcript",
        headers=auth_header(other),
        json={"speaker": "Alex", "start_time": 0, "end_time": 1, "text": "Secret note."},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Meeting not found"
