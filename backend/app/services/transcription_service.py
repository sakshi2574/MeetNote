import logging
import re
import threading
from dataclasses import dataclass
from pathlib import Path

from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

WHISPER_MODEL_SIZE = "small"
WHISPER_DEVICE = "cpu"
WHISPER_COMPUTE_TYPE = "int8"

_whisper_model: WhisperModel | None = None
_model_lock = threading.Lock()


class TranscriptionError(Exception):
    """Transcription failed. The message is safe to return to a client."""


@dataclass(frozen=True)
class TranscriptionResult:
    text: str


def transcribe_recording(recording_path: str | Path) -> TranscriptionResult:
    path = _existing_file(recording_path)
    try:
        model = get_whisper_model()
        segments, _info = model.transcribe(str(path))
        text = _transcript_text(segments)
    except Exception as exc:
        logger.warning(
            "Local transcription failed: %s: %s",
            type(exc).__name__,
            _safe_error_message(exc),
        )
        raise TranscriptionError("Transcription failed") from None

    if not text:
        logger.warning("Local transcription produced no text")
        raise TranscriptionError("Transcription failed")
    return TranscriptionResult(text=text)


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


def _transcript_text(segments) -> str:
    parts: list[str] = []
    for segment in segments:
        raw = getattr(segment, "text", "")
        if not isinstance(raw, str):
            continue
        cleaned = " ".join(raw.split())
        if cleaned:
            parts.append(cleaned)
    return " ".join(parts)
