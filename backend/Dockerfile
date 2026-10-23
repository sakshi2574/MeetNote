# MeetNote backend — FastAPI + local Whisper + sherpa-onnx diarization.
# Build: docker build -t meetnote-backend ./backend
FROM python:3.12-slim

# System deps: ffmpeg for any audio conversion, build tools for native wheels.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer cache).
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Application code.
COPY . .

# Pre-download the sherpa-onnx diarization models (~34 MB) so first
# transcription does not depend on GitHub reachability at runtime.
RUN python -m app.services.diarization_service || true

# Pre-warm the faster-whisper "small" model cache (~460 MB). Comment out to
# keep the image smaller; the model will download on first transcription.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')" || true

# Data directories (mount volumes in production to persist).
RUN mkdir -p /app/uploads/recordings /app/models/diarization /data

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Single worker: MeetNote uses an in-process transcription queue.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
