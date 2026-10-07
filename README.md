# Meeting Intelligence Workspace

Transcript-based meeting workspace for searchable meeting notes, summaries, action items, and AI-assisted follow-up.

---

## 🌟 Architecture & Tech Stack

```
                     ┌──────────────────────────────────────────┐
                     │          Next.js 14 Frontend             │
                     │  (TypeScript, App Router, Lucide Icons)  │
                     └────────────────────┬─────────────────────┘
                                          │  REST API (HTTP / JSON)
                                          ▼
                     ┌──────────────────────────────────────────┐
                     │           Python FastAPI Backend         │
                     │ (Pydantic, transcript NLP, AI provider)  │
                     └────────────────────┬─────────────────────┘
                                          │  SQLite3 (PRAGMA foreign_keys)
                                          ▼
                     ┌──────────────────────────────────────────┐
                     │            SQLite Database               │
                     │           (`fireflies.db`)               │
                     └──────────────────────────────────────────┘
```

### Technical Stack
* **Frontend**: Next.js 14, TypeScript, React 18, Custom CSS Design System (`globals.css`), Lucide React Icons.
* **Backend**: Python 3.10+, FastAPI, SQLite (`sqlite3` standard library), Pydantic v2.
* **Database**: SQLite (`fireflies.db`) with relational design & cascade deletions.

---

## 🗄️ Database Schema

The database is built on SQLite with foreign key enforcement (`PRAGMA foreign_keys = ON`).

```
  ┌─────────────────┐           ┌─────────────────────────────┐           ┌─────────────────────┐
  │    meetings     │◄──────────│    meeting_participants     │──────────►│    participants     │
  ├─────────────────┤ 1       * ├─────────────────────────────┤ *       1 ├─────────────────────┤
  │ id (PK)         │           │ meeting_id (FK)             │           │ id (PK)             │
  │ title           │           │ participant_id (FK)         │           │ name (UNIQUE)       │
  │ date            │           └─────────────────────────────┘           └─────────────────────┘
  │ duration_sec    │
  │ overview        │
  │ keywords        │           ┌─────────────────────────────┐
  │ created_at      │◄──────────│          segments           │
  └────────┬────────┘ 1       * ├─────────────────────────────┤
           │                    │ id (PK), meeting_id (FK)    │
           │                    │ idx, speaker, start_sec, text│
           │                    └─────────────────────────────┘
           │
           │                    ┌─────────────────────────────┐
           ├───────────────────►│          chapters           │
           │ 1                * ├─────────────────────────────┤
           │                    │ id (PK), meeting_id (FK)    │
           │                    │ title, start_sec            │
           │                    └─────────────────────────────┘
           │
           │                    ┌─────────────────────────────┐
           ├───────────────────►│        action_items         │
           │ 1                * ├─────────────────────────────┤
           │                    │ id (PK), meeting_id (FK)    │
           │                    │ text, assignee, done        │
           │                    └─────────────────────────────┘
           │
           │                    ┌─────────────────────────────┐
           └───────────────────►│         highlights          │
                              * ├─────────────────────────────┤
                                │ id (PK), meeting_id (FK)    │
                                │ idx, speaker, start_sec, text│
                                └─────────────────────────────┘
```

---

## ✨ Features

### 1. Meetings Library / Dashboard
* **Workspace Views**: List view & Grid card view toggle.
* **Filter & Search**: Real-time filtering by meeting title, keyword, participant name, or date range.
* **Sorting**: Instant recency sorting (Newest first / Oldest first).
* **Meeting Groups**: Organized automatically by week (`Oct 5 - Oct 11`).

### 2. Meeting & Transcript Detail View
* **Interactive Player**: Scrubber slider, Play/Pause, 10s skip controls, playback speeds (`0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`), and animated visual audio waveform.
* **Text-to-Speech (TTS)**: Optional Web Speech API audio readout that reads speaker segments aloud in real time.
* **Line-by-Line Seeking**: Clicking any segment in the transcript instantly seeks the player to that timestamp.
* **Auto-Scroll Sync**: Active transcript line highlights and auto-scrolls smoothly into view as audio plays.
* **Transcript Search**: Instant query search with term highlighting (`<mark>`) and match counters.
* **Speaker Badges**: Dynamic speaker avatar badges with distinct color palettes per participant.

### 3. AI Summary & Action Items
* **Overview Summary**: Transcript-derived summary, upgraded to a model-generated summary when an AI provider is configured.
* **Keyword Chips**: Clickable topic tags (clicking a keyword filters the transcript search).
* **Chapters Outline**: Meeting timeline topics with jump timestamps.
* **Action Items Checklist**: Complete tasks, assign team members, double-click inline editing, and add new action items.

### 4. Meeting AI
* **Global AI Chat**: Context-grounded chat over meeting transcripts, with meeting source references.
* **In-Meeting AI Assistant**: Ask questions about a specific transcript.
* **AI Templates**: Generate follow-up emails, sales notes, and action-item drafts from a meeting.
* AI chat, templates, model-generated summaries, and audio transcription require `OPENAI_API_KEY`.

### 5. Soundbites & Highlights (Bonus)
* Star any segment in the transcript to save it to your Soundbites tab. Click soundbites to jump directly to that exact timestamp.

### 6. Export Options (Bonus)
* Export transcripts and summaries to **Markdown (`.md`)** or **Print/PDF** layout.

### 7. Workspace UI
* Responsive meeting workspace with light/dark themes, search, and transcript upload.
* Live meeting bots, team accounts, and third-party integrations are not included; those routes clearly state their availability.

---

## ⚡ Quick Start & Setup

### Prerequisites
* **Python 3.10+**
* **Node.js 18+**

### 1. Run Backend (FastAPI)
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
> The database is created empty on first launch. No sample meetings are inserted.

### 2. Run Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment configuration

For local use, copy `backend/.env.example` to `backend/.env`; copy `frontend/.env.example` to `frontend/.env.local`. For hosted use, set these as service environment variables:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Enables provider-backed summaries, AskFred answers, AI templates, and audio transcription. Leave unset to use extractive summaries and transcript-only uploads. |
| `OPENAI_MODEL` | Chat model name; defaults to `gpt-4o-mini`. |
| `OPENAI_TRANSCRIPTION_MODEL` | Audio transcription model; defaults to `whisper-1`. |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible API endpoint. |
| `APP_ACCESS_TOKEN` | Optional shared access token enforced by the API. Set a long random value for a private deployment. |
| `CORS_ORIGINS` | Comma-separated frontend origins, for example `https://meetings.example.com`. |
| `DB_PATH` | SQLite database path. Use a mounted persistent disk in production. |

Set `NEXT_PUBLIC_API_URL` in the frontend environment to the backend's public origin, without a trailing slash. For example, `https://api.example.com`.

### Deployment notes

Deploy the frontend and API as separate services, allow only the frontend origin in `CORS_ORIGINS`, and persist the directory containing `DB_PATH`. SQLite requires a durable disk and a single backend replica; use a managed database before scaling to multiple API replicas. Set `APP_ACCESS_TOKEN` and serve both services over HTTPS when exposing the app beyond a trusted network. Team accounts, calendar bots, and third-party integrations are not implemented and are not shown as connected.

Build the frontend with `npm run build` and serve it with `npm start`. The backend can be started with the included `Procfile` or `uvicorn main:app --host 0.0.0.0 --port $PORT`.

### Vercel + Render

1. Import the repository into Render and create the API service from `render.yaml`. The service uses a persistent disk, so select a Render plan that supports disks.
2. In Render, set `CORS_ORIGINS` to the deployed Vercel origin, set a strong `APP_ACCESS_TOKEN`, and optionally set `OPENAI_API_KEY` for model-backed features.
3. Import the same repository into Vercel with `frontend` as the Root Directory. Set `NEXT_PUBLIC_API_URL` to the Render API origin (for example, `https://meeting-workspace-api.onrender.com`) and redeploy.
4. Open the Vercel URL and enter the same access token configured in Render.

---

## 📡 API Reference Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/meetings` | List meetings with filtering (`q`, `participant`, `date_from`, `sort`) |
| `POST` | `/api/uploads` | Process a transcript upload or transcribe a supported audio file |
| `POST` | `/api/meetings` | Create meeting & auto-parse transcript summary |
| `GET` | `/api/meetings/{id}` | Get full meeting detail (segments, chapters, action items) |
| `PATCH` | `/api/meetings/{id}` | Update title or participants |
| `DELETE` | `/api/meetings/{id}` | Delete meeting |
| `POST` | `/api/meetings/{id}/action-items` | Add action item |
| `PATCH` | `/api/action-items/{aid}` | Toggle done status or edit text |
| `DELETE` | `/api/action-items/{aid}` | Delete action item |
| `GET` | `/api/meetings/{id}/highlights` | Get saved soundbites |
| `POST` | `/api/meetings/{id}/highlights` | Create soundbite highlight |
| `POST` | `/api/chat` | AskFred AI assistant query |
| `POST` | `/api/ai-apps/generate` | Generate a meeting-grounded AI work artifact |
| `GET` | `/api/health` | Database, AI, and access-control readiness |
| `GET` | `/api/analytics` | Transcript-derived speaker, keyword, and action-item metrics |
| `GET` | `/api/search` | Global search across all transcripts |
| `GET` | `/api/meetings/{id}/export` | Export as Markdown (`format=md`) |
