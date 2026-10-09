"""Local speaker diarization with sherpa-onnx.

This is offline and does not call a paid API. The segmentation model is the
ONNX conversion of pyannote/segmentation-3.0 (MIT). The embedding model is the
ONNX conversion of 3D-Speaker's English CAM++ network trained on VoxCeleb
(Apache-2.0). sherpa-onnx itself is Apache-2.0.

Models are not downloaded during transcription. Install them once with:

    python -m app.services.diarization_service

Transcription still succeeds when the models are missing or diarization fails.
Those cues keep the speaker label "Unknown".
"""

import sys
import tarfile
import threading
import urllib.request
from pathlib import Path

import numpy as np

from app.core.config import BACKEND_DIR
from app.services.speaker_assignment import SpeakerTurn

DIARIZATION_DIR = BACKEND_DIR / "models" / "diarization"
SEGMENTATION_MODEL = DIARIZATION_DIR / "sherpa-onnx-pyannote-segmentation-3-0" / "model.onnx"
EMBEDDING_MODEL = DIARIZATION_DIR / "3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx"

SEGMENTATION_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2"
)
EMBEDDING_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx"
)
SEGMENTATION_MEMBER = "sherpa-onnx-pyannote-segmentation-3-0/model.onnx"

# Library default. A higher value merges more voices into fewer speakers.
CLUSTER_THRESHOLD = 0.5

_engine = None
_engine_lock = threading.Lock()


class DiarizationUnavailable(Exception):
    """Models or audio needed for diarization are not available."""


def models_ready() -> bool:
    return SEGMENTATION_MODEL.is_file() and EMBEDDING_MODEL.is_file()


def diarize_recording(recording_path: str | Path) -> tuple[SpeakerTurn, ...]:
    """Return speaker turns for one recording.

    Speaker ids are cluster numbers from this pass. ``speakers_for_cues`` turns
    them into Speaker 1, Speaker 2, and so on.
    """
    if not models_ready():
        raise DiarizationUnavailable("Speaker diarization models are not installed")

    engine = _get_engine()
    samples = _mono_f32(Path(recording_path), int(engine.sample_rate))
    if samples.size == 0:
        return ()

    result = engine.process(np.ascontiguousarray(samples, dtype=np.float32))
    turns: list[SpeakerTurn] = []
    for segment in result.sort_by_start_time():
        start = float(segment.start)
        end = float(segment.end)
        if end <= start:
            continue
        turns.append(SpeakerTurn(start=start, end=end, speaker=int(segment.speaker)))
    return tuple(turns)


def download_models(destination: Path = DIARIZATION_DIR) -> None:
    """Download the segmentation and embedding models into ``destination``."""
    destination.mkdir(parents=True, exist_ok=True)
    segmentation = destination / "sherpa-onnx-pyannote-segmentation-3-0" / "model.onnx"
    embedding = destination / EMBEDDING_MODEL.name
    if not segmentation.is_file():
        archive = destination / "sherpa-onnx-pyannote-segmentation-3-0.tar.bz2"
        _download(SEGMENTATION_URL, archive)
        segmentation.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive, "r:bz2") as bundle:
            member = bundle.getmember(SEGMENTATION_MEMBER)
            member.name = "model.onnx"
            bundle.extract(member, segmentation.parent, filter="data")
        archive.unlink(missing_ok=True)
    if not embedding.is_file():
        _download(EMBEDDING_URL, embedding)


def _get_engine():
    global _engine
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is None:
            _engine = _load_engine()
        return _engine


def _load_engine():
    try:
        import sherpa_onnx
    except ImportError as exc:
        raise DiarizationUnavailable("sherpa-onnx is not installed") from exc

    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=str(SEGMENTATION_MODEL),
            ),
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=str(EMBEDDING_MODEL),
            num_threads=1,
            provider="cpu",
        ),
        clustering=sherpa_onnx.FastClusteringConfig(num_clusters=-1, threshold=CLUSTER_THRESHOLD),
        min_duration_on=0.3,
        min_duration_off=0.5,
    )
    if not config.validate():
        raise DiarizationUnavailable("Speaker diarization models could not be loaded")
    return sherpa_onnx.OfflineSpeakerDiarization(config)


def _mono_f32(path: Path, sample_rate: int) -> np.ndarray:
    import av

    container = av.open(str(path))
    try:
        stream = next((item for item in container.streams if item.type == "audio"), None)
        if stream is None:
            raise DiarizationUnavailable("Recording has no audio stream")
        resampler = av.AudioResampler(format="flt", layout="mono", rate=sample_rate)
        chunks: list[np.ndarray] = []
        for frame in container.decode(stream):
            _collect_audio(chunks, resampler.resample(frame))
        _collect_audio(chunks, resampler.resample(None))
    finally:
        container.close()

    if not chunks:
        return np.zeros(0, dtype=np.float32)
    samples = np.concatenate(chunks)
    return np.clip(samples, -1.0, 1.0).astype(np.float32, copy=False)


def _collect_audio(chunks: list[np.ndarray], resampled) -> None:
    frames = resampled if isinstance(resampled, list) else [resampled]
    for frame in frames:
        if frame is None:
            continue
        chunks.append(np.asarray(frame.to_ndarray(), dtype=np.float32).reshape(-1))


def _download(url: str, destination: Path) -> None:
    print(f"Downloading {destination.name} ...", file=sys.stderr)
    urllib.request.urlretrieve(url, destination)


if __name__ == "__main__":
    download_models()
    print(f"Speaker diarization models are in {DIARIZATION_DIR}")
