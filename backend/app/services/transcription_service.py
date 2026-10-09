import logging
import math
import re
import threading
from dataclasses import dataclass
from pathlib import Path

from faster_whisper import WhisperModel

from app.services.diarization_service import DiarizationUnavailable, diarize_recording
from app.services.speaker_assignment import speakers_for_cues

logger = logging.getLogger(__name__)

WHISPER_MODEL_SIZE = "small"
WHISPER_DEVICE = "cpu"
WHISPER_COMPUTE_TYPE = "int8"

_whisper_model: WhisperModel | None = None
_model_lock = threading.Lock()
_diarization_notice = False
_progress_lock = threading.Lock()
_transcription_owner: int | None = None


class TranscriptionError(Exception):
    """Transcription failed. The message is safe to return to a client."""


class EmptyTranscription(TranscriptionError):
    """The recording produced no speech. This is not a decoder failure."""


@dataclass(frozen=True)
class TranscriptCue:
    text: str
    start: float
    end: float
    speaker: str | None = None


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    segments: tuple[TranscriptCue, ...]
    language: str | None


def claim_transcription(meeting_id: int) -> bool:
    """Reserve the local Whisper model for one meeting.

    faster-whisper runs on CPU in this process. A second request, including one
    for another meeting, is refused so two long recordings cannot decode at once.
    """
    global _transcription_owner
    with _progress_lock:
        if _transcription_owner is not None:
            return False
        _transcription_owner = meeting_id
        return True


def release_transcription(meeting_id: int) -> None:
    global _transcription_owner
    with _progress_lock:
        if _transcription_owner == meeting_id:
            _transcription_owner = None


def transcribe_recording(recording_path: str | Path) -> TranscriptionResult:
    path = _existing_file(recording_path)
    try:
        model = get_whisper_model()
        # Segment start/end times come from faster-whisper. Word timestamps stay
        # off. Speaker labels are added afterwards from diarization turns.
        segments, info = model.transcribe(str(path), word_timestamps=False)
        result = _speech_cues(segments, info)
        result = label_transcript(path, result)
    except EmptyTranscription:
        raise
    except TranscriptionError:
        raise
    except Exception as exc:
        logger.warning(
            "Local transcription failed: %s: %s",
            type(exc).__name__,
            _safe_error_message(exc),
        )
        raise TranscriptionError("Transcription failed") from None

    if not result.segments:
        logger.warning("Local transcription produced no speech")
        raise EmptyTranscription("No speech was detected")
    return result


def label_transcript(recording_path: str | Path, result: TranscriptionResult) -> TranscriptionResult:
    """Attach Speaker 1, Speaker 2, ... when diarization succeeds.

    A missing model or a diarization error leaves every cue unlabeled. Saving
    the transcript does not depend on speaker labels.
    """
    try:
        turns = diarize_recording(recording_path)
    except DiarizationUnavailable:
        _log_diarization_unavailable()
        return result
    except Exception as exc:
        logger.warning("Speaker diarization failed: %s", type(exc).__name__)
        return result

    labels = speakers_for_cues([(cue.start, cue.end) for cue in result.segments], turns)
    cues = tuple(
        TranscriptCue(text=cue.text, start=cue.start, end=cue.end, speaker=label)
        for cue, label in zip(result.segments, labels, strict=True)
    )
    return TranscriptionResult(text=result.text, segments=cues, language=result.language)


def _log_diarization_unavailable() -> None:
    global _diarization_notice
    if _diarization_notice:
        return
    _diarization_notice = True
    logger.info(
        "Speaker diarization models are not installed, so speakers stay Unknown. "
        "From the backend directory, run: python -m app.services.diarization_service"
    )


def get_whisper_model() -> WhisperModel:
    """Return the process-local Whisper model, loading it on first use.

    The first call downloads the CTranslate2 weights for ``small`` from
    Hugging Face when they are not already cached on this machine. Later
    transcriptions reuse the same instance and do not download again.
    """
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model

    with _model_lock:
        if _whisper_model is None:
            logger.info(
                "Loading faster-whisper model %s (device=%s, compute_type=%s). "
                "The first transcription downloads this model from Hugging Face "
                "if it is not already cached.",
                WHISPER_MODEL_SIZE,
                WHISPER_DEVICE,
                WHISPER_COMPUTE_TYPE,
            )
            _whisper_model = WhisperModel(
                WHISPER_MODEL_SIZE,
                device=WHISPER_DEVICE,
                compute_type=WHISPER_COMPUTE_TYPE,
            )
        return _whisper_model


def _safe_error_message(exc: BaseException) -> str:
    message = " ".join(str(exc).split())
    if not message:
        return "no error message"

    message = re.sub(r"(?i)\bBearer\s+\S+", "Bearer [redacted]", message)
    message = re.sub(
        r"(?i)\b(authorization|api[-_]?key|hf[-_]?token|token|secret|password)\b\s*[:=]\s*\S+",
        r"\1: [redacted]",
        message,
    )
    message = re.sub(r"\bsk-[A-Za-z0-9_\-]{8,}\b", "[redacted]", message)
    message = re.sub(r"\bhf_[A-Za-z0-9]{8,}\b", "[redacted]", message)
    message = re.sub(
        r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b",
        "[redacted]",
        message,
    )
    return message


def _existing_file(recording_path: str | Path) -> Path:
    try:
        path = Path(recording_path)
        if path.is_file():
            return path
    except OSError:
        pass
    raise FileNotFoundError(recording_path)


def _speech_cues(segments, info) -> TranscriptionResult:
    cues: list[TranscriptCue] = []
    for segment in segments:
        cue = _cue_from_segment(segment)
        if cue is not None:
            cues.append(cue)
    ordered = tuple(sorted(cues, key=lambda cue: (cue.start, cue.end)))
    if not ordered:
        logger.warning("Local transcription produced no speech")
        raise EmptyTranscription("No speech was detected")
    return TranscriptionResult(
        text=" ".join(cue.text for cue in ordered),
        segments=ordered,
        language=_language(info),
    )


def _cue_from_segment(segment) -> TranscriptCue | None:
    raw = getattr(segment, "text", "")
    if not isinstance(raw, str):
        return None
    cleaned = " ".join(raw.split())
    if not cleaned:
        return None

    start = _finite_seconds(getattr(segment, "start", None))
    end = _finite_seconds(getattr(segment, "end", None))
    if start is None or end is None:
        return None
    if start < 0:
        start = 0.0
    if end < start:
        return None
    return TranscriptCue(text=cleaned, start=start, end=end)


def _finite_seconds(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    if not math.isfinite(number):
        return None
    return number


def _language(info) -> str | None:
    raw = getattr(info, "language", None)
    if not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    return cleaned or None
