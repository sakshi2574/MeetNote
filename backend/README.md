# MeetNote API

FastAPI backend for MeetNote. This foundation serves a health check, a SQLite database session, and JWT helpers. Authentication routes are not included yet.

## Setup

From the `backend` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Copy the example environment file and replace the JWT secret before you use authentication:

```powershell
copy .env.example .env
```

`.env` stays on your machine. The app can start without it and uses the same defaults as `.env.example`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLAlchemy database URL. Default is SQLite file `meetnote.db`. |
| `JWT_SECRET_KEY` | Secret used to sign access tokens. |
| `JWT_ALGORITHM` | JWT signing algorithm. Default is `HS256`. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime in minutes. |
| `FRONTEND_URL` | Allowed browser origin for CORS. Default is `http://localhost:5173`. |

## Run

From the `backend` directory, with the virtual environment active:

```powershell
uvicorn app.main:app --reload --port 8000
```

On startup, SQLAlchemy creates `meetnote.db` in this directory if it does not exist. There are no tables yet.

## Check

Health:

```powershell
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok","service":"MeetNote API"}
```

Interactive API docs: [http://localhost:8000/docs](http://localhost:8000/docs)
