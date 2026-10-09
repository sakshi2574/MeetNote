from types import SimpleNamespace

import pytest

from app.services import diarization_service, transcription_service
from app.services.diarization_service import DiarizationUnavailable
from app.services.speaker_assignment import SpeakerTurn, speakers_for_cues
from app.services.transcription_service import TranscriptCue, TranscriptionResult
from tests.test_transcription import (
    auth_header,
    install_whisper,
    register_and_login,
    upload_recording,
)


def test_speakers_follow_the_order_they_are_first_heard():
    turns = (
        SpeakerTurn(start=1.0, end=2.0, speaker=4),
        SpeakerTurn(start=0.0, end=1.0, speaker=9),
    )
    labels = speakers_for_cues([(0.1, 0.9), (1.1, 1.9)], turns)
    assert labels == ("Speaker 1", "Speaker 2")


def test_a_voice_that_wins_no_cue_does_not_take_a_number():
    turns = (
        SpeakerTurn(start=1.25, end=2.04, speaker=1),
        SpeakerTurn(start=2.04, end=12.0, speaker=2),
    )
    labels = speakers_for_cues([(0.0, 7.5), (7.5, 12.4)], turns)
    assert labels == ("Speaker 1", "Speaker 1")


def test_labels_follow_cue_order_even_if_cues_arrive_unsorted():
    turns = (
        SpeakerTurn(start=0.0, end=1.0, speaker=5),
        SpeakerTurn(start=1.0, end=2.0, speaker=8),
    )
    labels = speakers_for_cues([(1.1, 1.9), (0.1, 0.9)], turns)
    assert labels == ("Speaker 2", "Speaker 1")


def test_one_speaker_recording_uses_a_single_label():
    turns = (
        SpeakerTurn(start=0.0, end=1.2, speaker=3),
        SpeakerTurn(start=1.4, end=3.0, speaker=3),
    )
    labels = speakers_for_cues([(0.2, 1.0), (1.6, 2.8)], turns)
    assert labels == ("Speaker 1", "Speaker 1")


def test_silence_and_weak_overlap_stay_unknown():
    turns = (SpeakerTurn(start=0.0, end=0.4, speaker=1),)
    labels = speakers_for_cues([(2.0, 3.0), (0.0, 2.0)], turns)
    assert labels == ("Unknown", "Unknown")


def test_overlapping_speech_is_not_guessed():
    turns = (
        SpeakerTurn(start=0.0, end=2.0, speaker=1),
        SpeakerTurn(start=0.0, end=1.8, speaker=2),
    )
    assert speakers_for_cues([(0.0, 2.0)], turns) == ("Unknown",)


def test_dominant_overlap_selects_that_speaker():
    turns = (
        SpeakerTurn(start=0.0, end=1.8, speaker=2),
        SpeakerTurn(start=1.8, end=2.0, speaker=5),
    )
    assert speakers_for_cues([(0.0, 2.0)], turns) == ("Speaker 1",)


def test_missing_models_do_not_run_diarization(monkeypatch):
    monkeypatch.setattr(diarization_service, "models_ready", lambda: False)
    with pytest.raises(DiarizationUnavailable):
        diarization_service.diarize_recording("unused.webm")


def test_diarization_failure_keeps_the_transcript(monkeypatch):
    def boom(_path):
        raise RuntimeError(r"D:\secret\embedding.onnx failed")

    monkeypatch.setattr(transcription_service, "diarize_recording", boom)
    result = transcription_service.label_transcript(
        "unused.webm",
        TranscriptionResult(
            text="Hello team.",
            segments=(TranscriptCue(text="Hello team.", start=0.2, end=1.4),),
            language="en",
        ),
    )
    assert result.language == "en"
    assert result.segments[0].text == "Hello team."
    assert result.segments[0].speaker is None
    assert result.segments[0].start == 0.2


def test_transcription_stores_speaker_labels_and_keeps_manual_edits(client, monkeypatch):
    _, token = register_and_login(client, "Owner", "owner-speakers@example.com")
    meeting_id = upload_recording(client, token, "owner-speakers")
    transcription_service._transcription_owner = None

    class TwoSpeakerModel:
        def __init__(self, model_size_or_path, device, compute_type):
            assert model_size_or_path == "small"
            assert device == "cpu"
            assert compute_type == "int8"

        def transcribe(self, audio, **kwargs):
            assert kwargs.get("word_timestamps") is False
            return (
                iter(
                    (
                        SimpleNamespace(text="Hello from the first voice.", start=0.2, end=1.0),
                        SimpleNamespace(text="And the second voice replies.", start=1.2, end=2.4),
                    )
                ),
                SimpleNamespace(language="en", duration=3.0),
            )

    def turns(_path):
        return (
            SpeakerTurn(start=0.0, end=1.1, speaker=7),
            SpeakerTurn(start=1.1, end=2.5, speaker=4),
        )

    install_whisper(monkeypatch, TwoSpeakerModel)
    monkeypatch.setattr(transcription_service, "diarize_recording", turns)
    created = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert created.status_code == 200, created.text
    rows = created.json()["segments"]
    assert [row["speaker"] for row in rows] == ["Speaker 1", "Speaker 2"]
    assert [row["source"] for row in rows] == ["ai", "ai"]
    assert rows[0]["start_time"] == 0.2
    assert rows[1]["end_time"] == 2.4

    edited = client.put(
        f"/transcript/{rows[0]['id']}",
        headers=auth_header(token),
        json={"speaker": "Alex", "text": "Corrected by hand."},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["source"] == "manual"
    assert edited.json()["speaker"] == "Alex"

    class RetryModel(TwoSpeakerModel):
        def transcribe(self, audio, **kwargs):
            assert kwargs.get("word_timestamps") is False
            return (
                iter((SimpleNamespace(text="A later generated line.", start=1.2, end=2.4),)),
                SimpleNamespace(language="en", duration=3.0),
            )

    def boom(_path):
        raise RuntimeError(r"D:\secret\embedding.onnx failed")

    install_whisper(monkeypatch, RetryModel)
    monkeypatch.setattr(transcription_service, "diarize_recording", boom)
    retried = client.post(f"/meetings/{meeting_id}/transcribe", headers=auth_header(token))

    assert retried.status_code == 200, retried.text
    assert "secret" not in retried.text
    saved = client.get(f"/meetings/{meeting_id}/transcript", headers=auth_header(token)).json()
    manual = next(row for row in saved if row["text"] == "Corrected by hand.")
    generated = [row for row in saved if row["source"] == "ai"]
    assert manual["speaker"] == "Alex"
    assert manual["source"] == "manual"
    assert len(generated) == 1
    assert generated[0]["speaker"] == "Unknown"
    assert generated[0]["text"] == "A later generated line."
    assert "Hello from the first voice." not in {row["text"] for row in saved}
