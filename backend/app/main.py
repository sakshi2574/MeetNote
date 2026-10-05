from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import init_db
from app.routers.auth import router as auth_router
from app.routers.meetings import router as meetings_router
from app.routers.transcripts import router as transcripts_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="MeetNote API", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(meetings_router)
app.include_router(transcripts_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "MeetNote API"}
