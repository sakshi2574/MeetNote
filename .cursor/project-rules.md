# MeetNote Project Rules

## Project

MeetNote is an AI-powered meeting recorder, transcription,
and meeting intelligence platform.

## Architecture

The project contains three main applications:

- extension: Chrome browser extension
- frontend: Web dashboard
- backend: FastAPI backend

## Frontend

Use:

- React
- Vite
- Tailwind CSS
- React Router
- Axios

Frontend responsibilities:

- Dashboard
- Meeting history
- Meeting details
- Transcript UI
- AI summary UI
- Action items
- Decisions
- Settings

## Chrome Extension

Use:

- React
- Vite
- Chrome Manifest V3
- MediaRecorder API

Extension responsibilities:

- Start recording
- Pause recording
- Resume recording
- Stop recording
- Recording timer
- Audio capture
- Upload recording
- Show recording status

## Backend

Use:

- Python
- FastAPI
- SQLAlchemy
- Pydantic
- SQLite initially
- JWT authentication

Backend responsibilities:

- Authentication
- User management
- Meeting management
- Recording upload
- Transcript processing
- AI processing
- Meeting history
- Search
- Export

## AI

The AI pipeline should support:

- Speech-to-text
- Timestamped transcript
- Speaker identification/diarization when supported
- Meeting summary
- Key discussion points
- Action items
- Decisions
- Open questions

## Development Rules

1. Inspect the existing code before modifying files.
2. Do not modify unrelated files.
3. Do not rewrite working code unnecessarily.
4. Keep components reusable.
5. Keep frontend and backend responsibilities separate.
6. Use environment variables for secrets.
7. Never hardcode API keys.
8. Do not commit `.env` files.
9. Do not commit `node_modules`.
10. Do not commit Python virtual environments.
11. Use clear and consistent naming.
12. Keep API contracts documented.
13. Test each feature before moving to the next feature.
14. Explain changed files after completing a task.