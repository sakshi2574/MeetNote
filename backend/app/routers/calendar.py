
import json
import secrets
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.google_calendar_connection import GoogleCalendarConnection
from app.models.user import User

router = APIRouter(prefix="/calendar", tags=["calendar"])

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events.readonly"
]
STATE_MAX_AGE_SECONDS = 600


def require_google_config():
    required = [
        settings.google_client_id,
        settings.google_client_secret,
        settings.google_redirect_uri,
        settings.google_token_encryption_key,
        settings.jwt_secret_key,
    ]

    if not all(required):
        raise HTTPException(
            status_code=503,
            detail="Google Calendar is not configured. Check backend/.env.",
        )


def get_fernet():
    require_google_config()

    try:
        return Fernet(
            settings.google_token_encryption_key.encode("utf-8")
        )
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=503,
            detail="Google Calendar encryption key is invalid.",
        ) from None


def state_serializer():
    require_google_config()

    return URLSafeTimedSerializer(
        settings.jwt_secret_key,
        salt="meetnote-google-calendar-oauth",
    )


def make_flow(state=None):
    require_google_config()

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri],
            }
        },
        scopes=SCOPES,
        state=state,
        autogenerate_code_verifier=True,
    )

    flow.redirect_uri = settings.google_redirect_uri
    return flow


def get_credentials(connection):
    try:
        raw = get_fernet().decrypt(
            connection.encrypted_credentials.encode("utf-8")
        )
        data = json.loads(raw.decode("utf-8"))
        credentials = Credentials.from_authorized_user_info(
            data, SCOPES
        )

        if credentials.expired and credentials.refresh_token:
            credentials.refresh(GoogleRequest())

            connection.encrypted_credentials = get_fernet().encrypt(
                credentials.to_json().encode("utf-8")
            ).decode("utf-8")

        if not credentials.valid:
            raise HTTPException(
                status_code=401,
                detail=(
                    "Google authorization expired. "
                    "Reconnect Google Calendar."
                ),
            )

        return credentials

    except InvalidToken:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not decrypt saved credentials. "
                "Check your encryption key."
            ),
        ) from None

    except (ValueError, TypeError, KeyError):
        raise HTTPException(
            status_code=500,
            detail=(
                "Saved Google credentials are invalid. "
                "Reconnect Google Calendar."
            ),
        ) from None


@router.get("/google/connect")
def google_connect(
    current_user: User = Depends(get_current_user),
):
    require_google_config()

    flow = make_flow()

    # Generate the PKCE verifier before creating the signed state.
    flow.code_verifier = secrets.token_urlsafe(64)

    state_payload = {
        "user_id": current_user.id,
        "nonce": secrets.token_urlsafe(24),
        "code_verifier": flow.code_verifier,
    }
    state = state_serializer().dumps(state_payload)

    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )

    return {"authorization_url": authorization_url}

@router.get("/google/callback")
def google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    frontend = settings.frontend_url.rstrip("/")

    if error:
        return RedirectResponse(
            f"{frontend}/calendar?google=error&reason=authorization_denied"
        )

    if not code or not state:
        return RedirectResponse(
            f"{frontend}/calendar?google=error&reason=invalid_callback"
        )

    try:
        payload = state_serializer().loads(
            state,
            max_age=STATE_MAX_AGE_SECONDS,
        )
        user_id = int(payload["user_id"])
        code_verifier = payload["code_verifier"]

        if not payload.get("nonce") or not code_verifier:
            raise BadSignature("Missing OAuth state data")
    except (BadSignature, KeyError, ValueError, TypeError):
        return RedirectResponse(
            f"{frontend}/calendar?google=error&reason=invalid_state"
        )

    user = db.get(User, user_id)

    if user is None:
        return RedirectResponse(
            f"{frontend}/calendar?google=error&reason=user_not_found"
        )

    try:
        flow = make_flow(state=state)
        flow.code_verifier = code_verifier
        flow.fetch_token(code=code)
        credentials = flow.credentials

        existing = (
            db.query(GoogleCalendarConnection)
            .filter(
                GoogleCalendarConnection.user_id == user.id
            )
            .first()
        )

        # Preserve the old refresh token if Google doesn't issue one.
        if not credentials.refresh_token and existing:
            try:
                old_data = json.loads(
                    get_fernet().decrypt(
                        existing.encrypted_credentials.encode("utf-8")
                    ).decode("utf-8")
                )
                credentials.refresh_token = old_data.get(
                    "refresh_token"
                )
            except (InvalidToken, ValueError, TypeError):
                pass

        if not credentials.refresh_token:
            return RedirectResponse(
                f"{frontend}/calendar?google=error&reason=missing_refresh_token"
            )

        encrypted = get_fernet().encrypt(
            credentials.to_json().encode("utf-8")
        ).decode("utf-8")

        if existing:
            existing.encrypted_credentials = encrypted
        else:
            db.add(
                GoogleCalendarConnection(
                    user_id=user.id,
                    encrypted_credentials=encrypted,
                )
            )

        db.commit()

        return RedirectResponse(
            f"{frontend}/calendar?google=connected"
        )

    except Exception as exc:
        db.rollback()
        print(
            f"Google Calendar OAuth failed: "
            f"{type(exc).__name__}: {exc}"
        )
        return RedirectResponse(
            f"{frontend}/calendar?google=error&reason=token_exchange_failed"
        )


@router.get("/google/status")
def google_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connection = (
        db.query(GoogleCalendarConnection)
        .filter(
            GoogleCalendarConnection.user_id == current_user.id
        )
        .first()
    )

    return {
        "connected": connection is not None,
        "email": getattr(connection, "email", None)
        if connection
        else None,
    }


@router.get("/google/events")
def google_events(
    days: int = Query(default=30, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connection = (
        db.query(GoogleCalendarConnection)
        .filter(
            GoogleCalendarConnection.user_id == current_user.id
        )
        .first()
    )

    if connection is None:
        raise HTTPException(
            status_code=404,
            detail="Google Calendar is not connected.",
        )

    credentials = get_credentials(connection)
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=days)

    try:
        service = build(
            "calendar",
            "v3",
            credentials=credentials,
            cache_discovery=False,
        )

        result = service.events().list(
            calendarId="primary",
            timeMin=now.isoformat(),
            timeMax=end.isoformat(),
            singleEvents=True,
            orderBy="startTime",
            maxResults=250,
        ).execute()

        # Save any refreshed credentials.
        db.commit()

        events = []

        for event in result.get("items", []):
            start = event.get("start", {})
            finish = event.get("end", {})
            entry_points = event.get(
                "conferenceData", {}
            ).get("entryPoints", [])

            video_link = next(
                (
                    point.get("uri")
                    for point in entry_points
                    if point.get("entryPointType") == "video"
                ),
                None,
            )

            events.append(
                {
                    "id": event.get("id"),
                    "title": event.get("summary") or "Untitled event",
                    "description": event.get("description"),
                    "start": start.get("dateTime") or start.get("date"),
                    "end": finish.get("dateTime") or finish.get("date"),
                    "html_link": event.get("htmlLink"),
                    "meeting_link": video_link or event.get("hangoutLink"),
                    "location": event.get("location"),
                    "status": event.get("status"),
                }
            )

        return {"events": events}

    except HttpError as exc:
        db.rollback()
        print(
            f"Google Calendar API error: "
            f"HTTP {exc.resp.status}: "
            f"{exc.content.decode('utf-8', errors='replace')}"
        )
        raise HTTPException(
            status_code=502,
            detail="Google Calendar could not retrieve events. Try reconnecting.",
        ) from None


@router.delete("/google/disconnect")
def google_disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connection = (
        db.query(GoogleCalendarConnection)
        .filter(
            GoogleCalendarConnection.user_id == current_user.id
        )
        .first()
    )

    if connection:
        db.delete(connection)
        db.commit()

    return {"connected": False}
