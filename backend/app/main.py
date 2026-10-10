from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import init_db
from app.services.intelligence_service import recover_interrupted_intelligence
from app.services.transcription_jobs import recover_interrupted_transcriptions, shutdown_transcription_jobs, start_transcription_jobs
from app.routers.action_items import router as action_items_router
from app.routers.intelligence import router as intelligence_router
from app.routers.auth import router as auth_router
from app.routers.decisions import router as decisions_router
from app.routers.exports import router as exports_router
from app.routers.meetings import router as meetings_router
from app.routers.recordings import playback_router, router as recordings_router
from app.routers.transcripts import router as transcripts_router
from app.routers.transcriptions import router as transcriptions_router
from app.routers.dashboard import router as dashboard_router

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    recover_interrupted_transcriptions()
    recover_interrupted_intelligence()
    start_transcription_jobs()
    yield
    shutdown_transcription_jobs()


app = FastAPI(title="MeetNote API", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(meetings_router)
app.include_router(dashboard_router)
app.include_router(transcripts_router)
app.include_router(transcriptions_router)
app.include_router(action_items_router)
app.include_router(decisions_router)
app.include_router(intelligence_router)
app.include_router(exports_router)
app.include_router(recordings_router)
app.include_router(playback_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "MeetNote API"}
