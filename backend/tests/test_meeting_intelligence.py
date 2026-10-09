from datetime import date

from app.db.database import SessionLocal
from app.models.meeting import Meeting
from app.services import intelligence_service, transcription_jobs
from app.services.meeting_extraction import (
    TranscriptLine,
    extract_meeting_intelligence,
    parse_deadline,
)
from app.services.transcription_service import TranscriptCue, TranscriptionResult
from tests.test_transcription import auth_header, register_and_login, upload_recording

MEETING_DAY = date(2026, 10, 9)  # a Friday

TRANSCRIPT = [
    ("Speaker 1", 2.0, "Good morning everyone. Today we'll discuss the launch plan for the mobile app."),
    ("Speaker 2", 9.0, "The mobile app beta is ready and the launch checklist is almost complete."),
    ("Speaker 1", 18.0, "The launch depends on the payment integration passing review."),
    ("Speaker 2", 27.0, "I'll send the launch checklist to the design team tomorrow."),
    ("Speaker 1", 36.0, "We decided to launch the mobile app beta on Tuesday."),
    ("Speaker 2", 44.0, "Maybe we should also move the marketing email?"),
    ("Speaker 1", 52.0, "We haven't decided on the pricing page yet."),
    ("Speaker 1", 60.0, "Priya, can you update the payment integration docs by October 14th?"),
    ("Speaker 2", 70.0, "We need to confirm the app store screenshots before the launch."),
    ("Speaker 1", 80.0, "Thank you."),
]


def lines(rows=TRANSCRIPT):
    return [TranscriptLine(text=text, start=start, speaker=speaker) for speaker, start, text in rows]


def add_segments(client, token, meeting_id, rows=TRANSCRIPT):
    for speaker, start, text in rows:
        created = client.post(
            f"/meetings/{meeting_id}/transcript",
            headers=auth_header(token),
            json={"speaker": speaker, "start_time": start, "end_time": start + 5, "text": text},
        )
        assert created.status_code == 201, created.text


def new_meeting(client, token, title="Launch sync"):
    created = client.post(
        "/meetings",
        headers=auth_header(token),
        json={"title": title, "meeting_date": "2026-10-09T10:00:00Z"},
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def regenerate(client, token, meeting_id, **params):
    response = client.post(
        f"/meetings/{meeting_id}/intelligence",
        headers=auth_header(token),
        params=params,
    )
    assert response.status_code == 200, response.text
    return response.json()


def items(client, token, meeting_id):
    return client.get(f"/meetings/{meeting_id}/action-items", headers=auth_header(token)).json()


def decisions(client, token, meeting_id):
    return client.get(f"/meetings/{meeting_id}/decisions", headers=auth_header(token)).json()


# Extraction rules


def test_summary_uses_transcript_sentences_and_leads_with_the_purpose():
    result = extract_meeting_intelligence(lines(), MEETING_DAY)
    spoken = " ".join(text for _, _, text in TRANSCRIPT)

    assert result.summary is not None
    assert result.summary.startswith("Today we'll discuss the launch plan for the mobile app.")
    for sentence in result.summary.split(". "):
        assert sentence.rstrip(".") in spoken


def test_key_points_come_from_the_transcript_without_repeating_the_summary():
    result = extract_meeting_intelligence(lines(), MEETING_DAY)
    spoken = " ".join(text for _, _, text in TRANSCRIPT)

    assert 0 < len(result.key_points) <= 5
    assert len(result.key_points) < len(TRANSCRIPT)
    for point in result.key_points:
        assert point.text in spoken
        assert point.text not in (result.summary or "")
    timestamps = [point.timestamp for point in result.key_points]
    assert timestamps == sorted(timestamps)


def test_action_items_take_assignees_and_deadlines_only_from_the_transcript():
    result = extract_meeting_intelligence(lines(), MEETING_DAY)
    by_task = {item.task: item for item in result.action_items}

    checklist = by_task["I'll send the launch checklist to the design team tomorrow."]
    assert checklist.assignee == "Speaker 2"
    assert checklist.due_date == date(2026, 10, 10)
    assert checklist.timestamp == 27.0

    docs = by_task["Priya, can you update the payment integration docs by October 14th?"]
    assert docs.assignee == "Priya"
    assert docs.due_date == date(2026, 10, 14)

    screenshots = by_task["We need to confirm the app store screenshots before the launch."]
    assert screenshots.assignee is None
    assert screenshots.due_date is None

    assert "Maybe we should also move the marketing email?" not in by_task
    assert len(result.action_items) == 3


def test_decisions_exclude_suggestions_and_open_questions():
    result = extract_meeting_intelligence(lines(), MEETING_DAY)
    texts = [item.decision for item in result.decisions]

    assert texts == ["We decided to launch the mobile app beta on Tuesday."]
    assert result.decisions[0].timestamp == 36.0


def test_deadline_parsing_is_explicit_only():
    assert parse_deadline("Send it by Monday.", MEETING_DAY) == date(2026, 10, 12)
    assert parse_deadline("Send it by Friday.", MEETING_DAY) == date(2026, 10, 16)
    assert parse_deadline("Send it next Friday.", MEETING_DAY) is None
    assert parse_deadline("Send it next week.", MEETING_DAY) is None
    assert parse_deadline("Send it by 2026-11-02.", MEETING_DAY) == date(2026, 11, 2)
    assert parse_deadline("Due January 5th.", MEETING_DAY) == date(2027, 1, 5)
    assert parse_deadline("Due February 30th.", MEETING_DAY) is None


def test_empty_and_noise_only_transcripts_produce_nothing():
    for rows in (
        [],
        [("Unknown", 0.0, "Thank you."), ("Unknown", 3.0, "Okay."), ("Unknown", 6.0, "you")],
        [("Unknown", 0.0, "Hello, this is a test.")],
    ):
        result = extract_meeting_intelligence(lines(rows), MEETING_DAY)
        assert result.summary is None
        assert result.key_points == ()
        assert result.action_items == ()
        assert result.decisions == ()


def test_repeated_whisper_lines_are_not_counted_twice():
    rows = [
        ("Speaker 1", 0.0, "Hello, this is the test for the recorder and we are currently testing the audio."),
        ("Unknown", 30.0, "This is our recorder dashboard."),
        ("Unknown", 60.0, "This is our recorder dashboard."),
    ]
    result = extract_meeting_intelligence(lines(rows), MEETING_DAY)
    assert result.summary is not None
    everything = [result.summary, *(point.text for point in result.key_points)]
    assert " ".join(everything).count("This is our recorder dashboard.") <= 1
    assert result.key_points == ()


# Persistence, API, and safety


def test_regenerate_persists_summary_key_points_items_and_decisions(client):
    _, token = register_and_login(client, "Owner", "owner-intel-persist@example.com")
    meeting_id = new_meeting(client, token)
    add_segments(client, token, meeting_id)

    body = regenerate(client, token, meeting_id)
    assert body["status"] == "completed"
    assert body["method"] == "rule-based"
    assert body["summary_source"] == "ai"
    assert body["summary"].startswith("Today we'll discuss the launch plan")
    assert body["key_points"] and all(point["timestamp"] is not None for point in body["key_points"])

    saved_items = items(client, token, meeting_id)
    assert len(saved_items) == 3
    assert {item["source"] for item in saved_items} == {"ai"}
    assert {item["status"] for item in saved_items} == {"pending"}
    checklist = next(item for item in saved_items if "checklist" in item["task"])
    assert checklist["assignee"] == "Speaker 2"
    assert checklist["due_date"] == "2026-10-10"
    assert checklist["timestamp"] == 27.0

    saved_decisions = decisions(client, token, meeting_id)
    assert [item["decision"] for item in saved_decisions] == [
        "We decided to launch the mobile app beta on Tuesday."
    ]
    assert saved_decisions[0]["timestamp"] == 36.0
    assert saved_decisions[0]["source"] == "ai"

    meeting = client.get(f"/meetings/{meeting_id}", headers=auth_header(token)).json()
    assert meeting["summary"] == body["summary"]


def test_repeated_generation_does_not_duplicate_rows(client):
    _, token = register_and_login(client, "Owner", "owner-intel-repeat@example.com")
    meeting_id = new_meeting(client, token)
    add_segments(client, token, meeting_id)

    first = regenerate(client, token, meeting_id)
    first_items = items(client, token, meeting_id)
    first_decisions = decisions(client, token, meeting_id)
    second = regenerate(client, token, meeting_id)

    assert second["summary"] == first["summary"]
    assert second["key_points"] == first["key_points"]
    assert len(items(client, token, meeting_id)) == len(first_items)
    assert len(decisions(client, token, meeting_id)) == len(first_decisions)


def test_manual_and_edited_rows_survive_regeneration_without_duplicates(client):
    _, token = register_and_login(client, "Owner", "owner-intel-manual@example.com")
    meeting_id = new_meeting(client, token)
    add_segments(client, token, meeting_id)
    regenerate(client, token, meeting_id)

    manual = client.post(
        f"/meetings/{meeting_id}/action-items",
        headers=auth_header(token),
        json={"task": "Book the launch retro", "assignee": "Alex"},
    )
    assert manual.status_code == 201, manual.text
    assert manual.json()["source"] == "manual"

    generated = next(item for item in items(client, token, meeting_id) if "checklist" in item["task"])
    toggled = client.put(
        f"/action-items/{generated['id']}",
        headers=auth_header(token),
        json={"status": "completed"},
    )
    assert toggled.json()["source"] == "manual"

    screenshots = next(item for item in items(client, token, meeting_id) if "screenshots" in item["task"])
    renamed = client.put(
        f"/action-items/{screenshots['id']}",
        headers=auth_header(token),
        json={"task": "Confirm screenshots with design"},
    )
    assert renamed.status_code == 200, renamed.text

    decision = decisions(client, token, meeting_id)[0]
    edited = client.put(
        f"/decisions/{decision['id']}",
        headers=auth_header(token),
        json={"decision": "Launch the beta on Tuesday, October 13."},
    )
    assert edited.json()["source"] == "manual"

    regenerate(client, token, meeting_id)
    saved_items = items(client, token, meeting_id)
    tasks = [item["task"] for item in saved_items]
    assert "Book the launch retro" in tasks
    assert "Confirm screenshots with design" in tasks
    assert "We need to confirm the app store screenshots before the launch." not in tasks
    assert tasks.count("I'll send the launch checklist to the design team tomorrow.") == 1
    completed = next(item for item in saved_items if "checklist" in item["task"])
    assert completed["status"] == "completed"
    assert len(saved_items) == 4

    saved_decisions = decisions(client, token, meeting_id)
    assert [item["decision"] for item in saved_decisions] == ["Launch the beta on Tuesday, October 13."]


def test_edited_summary_is_kept_unless_replacement_is_requested(client):
    _, token = register_and_login(client, "Owner", "owner-intel-summary@example.com")
    meeting_id = new_meeting(client, token)
    add_segments(client, token, meeting_id)
    generated = regenerate(client, token, meeting_id)

    saved = client.put(
        f"/meetings/{meeting_id}/summary",
        headers=auth_header(token),
        json={"summary": "  Launch review, written by hand.  "},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["summary"] == "Launch review, written by hand."
    assert saved.json()["summary_source"] == "manual"

    kept = regenerate(client, token, meeting_id)
    assert kept["summary"] == "Launch review, written by hand."
    assert kept["summary_source"] == "manual"
    assert kept["key_points"] == generated["key_points"]

    replaced = regenerate(client, token, meeting_id, replace_summary="true")
    assert replaced["summary"] == generated["summary"]
    assert replaced["summary_source"] == "ai"

    blank = client.put(
        f"/meetings/{meeting_id}/summary",
        headers=auth_header(token),
        json={"summary": "   "},
    )
    assert blank.status_code == 422


def test_empty_transcript_does_not_fabricate_content(client):
    _, token = register_and_login(client, "Owner", "owner-intel-empty@example.com")
    meeting_id = new_meeting(client, token)

    body = regenerate(client, token, meeting_id)
    assert body["status"] == "completed"
    assert body["summary"] is None
    assert body["key_points"] == []
    assert items(client, token, meeting_id) == []
    assert decisions(client, token, meeting_id) == []


def test_generation_failure_keeps_previous_results_and_reports_a_safe_error(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-intel-fail@example.com")
    meeting_id = new_meeting(client, token)
    add_segments(client, token, meeting_id)
    before = regenerate(client, token, meeting_id)
    before_items = items(client, token, meeting_id)

    def boom(*_args, **_kwargs):
        raise RuntimeError(r"D:\secret\model.bin exploded")

    monkeypatch.setattr(intelligence_service, "extract_meeting_intelligence", boom)
    failed = regenerate(client, token, meeting_id)

    assert failed["status"] == "failed"
    assert failed["error"] == "Meeting insights could not be generated."
    assert "secret" not in str(failed)
    assert failed["summary"] == before["summary"]
    assert items(client, token, meeting_id) == before_items


def test_busy_meeting_returns_conflict(client):
    _, token = register_and_login(client, "Owner", "owner-intel-busy@example.com")
    meeting_id = new_meeting(client, token)
    intelligence_service._active.add(meeting_id)

    response = client.post(f"/meetings/{meeting_id}/intelligence", headers=auth_header(token))
    assert response.status_code == 409


def test_other_users_cannot_read_or_change_insights(client):
    _, owner = register_and_login(client, "Owner", "owner-intel-private@example.com")
    _, other = register_and_login(client, "Other", "other-intel-private@example.com")
    meeting_id = new_meeting(client, owner)
    add_segments(client, owner, meeting_id)
    regenerate(client, owner, meeting_id)

    assert client.get(f"/meetings/{meeting_id}/intelligence", headers=auth_header(other)).status_code == 404
    assert client.post(f"/meetings/{meeting_id}/intelligence", headers=auth_header(other)).status_code == 404
    assert (
        client.put(
            f"/meetings/{meeting_id}/summary",
            headers=auth_header(other),
            json={"summary": "Hijacked"},
        ).status_code
        == 404
    )
    assert client.get(f"/meetings/{meeting_id}/intelligence").status_code == 401
    owner_view = client.get(f"/meetings/{meeting_id}/intelligence", headers=auth_header(owner)).json()
    assert owner_view["summary"] != "Hijacked"


def test_restart_marks_interrupted_insights_failed(client):
    _, token = register_and_login(client, "Owner", "owner-intel-restart@example.com")
    meeting_id = new_meeting(client, token)
    db = SessionLocal()
    try:
        meeting = db.get(Meeting, meeting_id)
        meeting.intelligence_status = "processing"
        db.commit()
    finally:
        db.close()

    intelligence_service.recover_interrupted_intelligence()
    body = client.get(f"/meetings/{meeting_id}/intelligence", headers=auth_header(token)).json()
    assert body["status"] == "failed"
    assert body["error"] == "Insight generation stopped when the server restarted."


# Automatic processing after transcription


def _speech(_path):
    return TranscriptionResult(
        text="",
        segments=tuple(
            TranscriptCue(text=text, start=start, end=start + 5, speaker=speaker)
            for speaker, start, text in TRANSCRIPT
        ),
        language="en",
    )


def _recording_path(meeting_id):
    db = SessionLocal()
    try:
        return db.get(Meeting, meeting_id).recording_path
    finally:
        db.close()


def test_transcription_job_generates_insights_after_the_transcript_is_saved(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-intel-auto@example.com")
    meeting_id = upload_recording(client, token, "owner-intel-auto")
    monkeypatch.setattr(transcription_jobs, "transcribe_recording", _speech)

    transcription_jobs.run_transcription_job(meeting_id, _recording_path(meeting_id))

    status = client.get(f"/meetings/{meeting_id}/transcription", headers=auth_header(token)).json()
    assert status["status"] == "completed"
    body = client.get(f"/meetings/{meeting_id}/intelligence", headers=auth_header(token)).json()
    assert body["status"] == "completed"
    assert body["summary"]
    assert len(items(client, token, meeting_id)) == 3
    assert len(decisions(client, token, meeting_id)) == 1

    transcription_jobs.run_transcription_job(meeting_id, _recording_path(meeting_id))
    assert len(items(client, token, meeting_id)) == 3
    assert len(decisions(client, token, meeting_id)) == 1


def test_insight_failure_does_not_fail_transcription(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-intel-auto-fail@example.com")
    meeting_id = upload_recording(client, token, "owner-intel-auto-fail")
    monkeypatch.setattr(transcription_jobs, "transcribe_recording", _speech)

    def boom(*_args, **_kwargs):
        raise RuntimeError("extraction crashed")

    monkeypatch.setattr(intelligence_service, "extract_meeting_intelligence", boom)
    transcription_jobs.run_transcription_job(meeting_id, _recording_path(meeting_id))

    status = client.get(f"/meetings/{meeting_id}/transcription", headers=auth_header(token)).json()
    assert status["status"] == "completed"
    assert status["segment_count"] == len(TRANSCRIPT)
    body = client.get(f"/meetings/{meeting_id}/intelligence", headers=auth_header(token)).json()
    assert body["status"] == "failed"
    assert body["summary"] is None
    assert items(client, token, meeting_id) == []
