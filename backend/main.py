"""Fireflies clone backend: FastAPI + SQLite (stdlib sqlite3).
Run: uvicorn main:app --reload --port 8000
"""
import math
import os
import re
import secrets
import sqlite3
from collections import Counter
from contextlib import contextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic import BaseModel

load_dotenv()

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "fireflies.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,                 -- ISO datetime
  duration_sec INTEGER NOT NULL DEFAULT 0,
  overview TEXT DEFAULT '',
  keywords TEXT DEFAULT '',           -- comma separated
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, participant_id)
);
CREATE TABLE IF NOT EXISTS segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  start_sec INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_segments_meeting ON segments(meeting_id, start_sec);
CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_sec INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS action_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  assignee TEXT DEFAULT '',
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  segment_idx INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  start_sec INTEGER NOT NULL,
  text TEXT NOT NULL,
  note TEXT DEFAULT '',
  color TEXT DEFAULT '#6c47ff',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


@contextmanager
def get_db():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ---------- transcript parsing + mock "AI" summary ----------
LINE = re.compile(
    r"^\s*(?:\[?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]?\s*)?([^:\n\[\]]{1,40}):\s*(.+)$"
)
STOP = set("this that with have from they were will would there their about what when your which just like then than "
           "also been into some more very over such only other could should these those here going think know "
           "okay yeah right need want make sure".split())


def parse_transcript(raw: str):
    """Accepts lines like '[00:12] Alice: text', '00:12 Alice: text' or 'Alice: text'."""
    segs, clock = [], 0
    for line in raw.splitlines():
        if not line.strip():
            continue
        m = LINE.match(line)
        if not m:
            if segs:  # continuation of previous utterance
                segs[-1][2] += " " + line.strip()
            continue
        h, mi, s, speaker, text = m.groups()
        if mi is not None:
            clock = int(h or 0) * 3600 + int(mi) * 60 + int(s)
        segs.append([speaker.strip(), clock, text.strip()])
        clock += max(3, math.ceil(len(text.split()) / 2.5))  # estimate when no timestamp
    return segs


def summarize(segs):
    text = " ".join(s[2] for s in segs)
    sentences = re.split(r"(?<=[.!?])\s+", text)
    overview = " ".join(sentences[:3])
    words = [w for w in re.findall(r"[a-z]{4,}", text.lower()) if w not in STOP]
    keywords = [w for w, _ in Counter(words).most_common(6)]
    pat = re.compile(r"\b(i'll|i will|we need to|need to|let's|action item|can you|will send|follow up)\b", re.I)
    actions = [(s[2], s[0]) for s in segs if pat.search(s[2])][:6]
    chapters, size = [], max(1, math.ceil(len(segs) / 4))
    for i in range(0, len(segs), size):
        chunk = segs[i:i + size]
        cw = Counter(w for w in re.findall(r"[a-z]{4,}", " ".join(c[2] for c in chunk).lower()) if w not in STOP)
        title = " & ".join(w.capitalize() for w, _ in cw.most_common(2)) or "Discussion"
        chapters.append((title, chunk[0][1]))
    return overview, keywords, actions, chapters


def set_participants(c, mid, names):
    c.execute("DELETE FROM meeting_participants WHERE meeting_id=?", (mid,))
    for n in dict.fromkeys(x.strip() for x in names if x.strip()):
        c.execute("INSERT OR IGNORE INTO participants(name) VALUES (?)", (n,))
        pid = c.execute("SELECT id FROM participants WHERE name=?", (n,)).fetchone()["id"]
        c.execute("INSERT OR IGNORE INTO meeting_participants VALUES (?,?)", (mid, pid))


def create_meeting(c, title, date, participants, transcript, duration_sec=None):
    segs = parse_transcript(transcript)
    if not segs:
        raise HTTPException(400, "Could not parse any 'Speaker: text' lines from transcript")
    overview, kws, actions, chapters = summarize(segs)
    last = segs[-1]
    duration = duration_sec or last[1] + math.ceil(len(last[2].split()) / 2.5)
    cur = c.execute(
        "INSERT INTO meetings(title,date,duration_sec,overview,keywords) VALUES (?,?,?,?,?)",
        (title, date or datetime.now().isoformat(timespec="minutes"), duration, overview, ",".join(kws)),
    )
    mid = cur.lastrowid
    c.executemany("INSERT INTO segments(meeting_id,idx,speaker,start_sec,text) VALUES (?,?,?,?,?)",
                  [(mid, i, s[0], s[1], s[2]) for i, s in enumerate(segs)])
    c.executemany("INSERT INTO chapters(meeting_id,title,start_sec) VALUES (?,?,?)",
                  [(mid, t, s) for t, s in chapters])
    c.executemany("INSERT INTO action_items(meeting_id,text,assignee) VALUES (?,?,?)",
                  [(mid, t, a) for t, a in actions])
    set_participants(c, mid, participants or sorted({s[0] for s in segs}))
    return mid


# ---------- schemas ----------
class MeetingIn(BaseModel):
    title: str
    transcript: str
    date: Optional[str] = None
    participants: list[str] = []
    duration_sec: Optional[int] = None


class MeetingPatch(BaseModel):
    title: Optional[str] = None
    participants: Optional[list[str]] = None


class ActionIn(BaseModel):
    text: str
    assignee: str = ""
    due_date: Optional[str] = None


class ActionPatch(BaseModel):
    text: Optional[str] = None
    assignee: Optional[str] = None
    due_date: Optional[str] = None
    done: Optional[bool] = None


# ---------- app ----------
app = FastAPI(title="Fireflies Clone API")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def require_workspace_token(request, call_next):
    expected = os.getenv("APP_ACCESS_TOKEN")
    protected = request.url.path.startswith("/api/") and request.url.path not in {"/api/health", "/api/auth/check"}
    if expected and protected and request.method != "OPTIONS":
        supplied = request.headers.get("Authorization", "").removeprefix("Bearer ")
        if not secrets.compare_digest(supplied, expected):
            return JSONResponse({"detail": "Workspace access required."}, status_code=401)
    return await call_next(request)


def ai_client():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(503, "AI is not configured. Set OPENAI_API_KEY in the backend environment.")
    return AsyncOpenAI(api_key=api_key, base_url=os.getenv("OPENAI_BASE_URL") or None)


async def generate_ai_text(system: str, prompt: str) -> str:
    try:
        result = await ai_client().chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            temperature=0.2,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, "The AI provider request failed. Check provider configuration and try again.") from exc
    content = result.choices[0].message.content
    if not content:
        raise HTTPException(502, "The AI provider returned an empty response.")
    return content


async def generate_meeting_summary(mid: int):
    if not os.getenv("OPENAI_API_KEY"):
        return
    with get_db() as c:
        meeting = c.execute("SELECT title FROM meetings WHERE id=?", (mid,)).fetchone()
        segments = c.execute(
            "SELECT speaker, text FROM segments WHERE meeting_id=? ORDER BY idx LIMIT 200", (mid,)).fetchall()
    transcript = "\n".join(f"{row['speaker']}: {row['text']}" for row in segments)
    try:
        summary = await generate_ai_text(
            "Summarize the meeting accurately in 2-4 concise sentences. Use only the transcript; do not infer missing details.",
            f"Meeting: {meeting['title']}\nTranscript:\n{transcript[:40000]}",
        )
    except HTTPException:
        return
    with get_db() as c:
        c.execute("UPDATE meetings SET overview=? WHERE id=?", (summary, mid))


@app.on_event("startup")
def startup():
    with get_db() as c:
        c.executescript(SCHEMA)


@app.get("/api/health")
def health():
    with get_db() as c:
        c.execute("SELECT 1")
    return {
        "status": "ok",
        "database": "connected",
        "ai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "auth_required": bool(os.getenv("APP_ACCESS_TOKEN")),
    }


class AccessTokenIn(BaseModel):
    token: str


@app.post("/api/auth/check")
def check_access_token(body: AccessTokenIn):
    expected = os.getenv("APP_ACCESS_TOKEN")
    if expected and not secrets.compare_digest(body.token, expected):
        raise HTTPException(401, "The workspace access token is incorrect.")
    return {"authorized": True, "required": bool(expected)}


def meeting_row(c, mid):
    m = c.execute("SELECT * FROM meetings WHERE id=?", (mid,)).fetchone()
    if not m:
        raise HTTPException(404, "Meeting not found")
    d = dict(m)
    d["keywords"] = [k for k in d["keywords"].split(",") if k]
    d["participants"] = [r["name"] for r in c.execute(
        "SELECT p.name FROM participants p JOIN meeting_participants mp ON mp.participant_id=p.id "
        "WHERE mp.meeting_id=? ORDER BY p.name", (mid,))]
    return d


@app.get("/api/meetings")
def list_meetings(q: str = "", participant: str = "", date_from: str = "", date_to: str = "",
                  sort: str = "desc"):
    sql, args = "SELECT id FROM meetings m WHERE 1=1", []
    if q:
        sql += " AND (m.title LIKE ? OR m.keywords LIKE ?)"
        args += [f"%{q}%"] * 2
    if participant:
        sql += (" AND EXISTS (SELECT 1 FROM meeting_participants mp JOIN participants p ON p.id=mp.participant_id "
                "WHERE mp.meeting_id=m.id AND p.name LIKE ?)")
        args.append(f"%{participant}%")
    if date_from:
        sql += " AND m.date >= ?"; args.append(date_from)
    if date_to:
        sql += " AND m.date <= ?"; args.append(date_to + "T23:59:59")
    sql += " ORDER BY m.date " + ("ASC" if sort == "asc" else "DESC")
    with get_db() as c:
        return [meeting_row(c, r["id"]) for r in c.execute(sql, args)]


@app.post("/api/meetings", status_code=201)
async def post_meeting(body: MeetingIn):
    with get_db() as c:
        mid = create_meeting(c, body.title, body.date, body.participants, body.transcript, body.duration_sec)
    await generate_meeting_summary(mid)
    with get_db() as c:
        return meeting_row(c, mid)


@app.post("/api/uploads", status_code=201)
async def upload_meeting(file: UploadFile = File(...)):
    name = file.filename or "Meeting upload"
    contents = await file.read()
    if not contents:
        raise HTTPException(400, "The uploaded file is empty.")
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(413, "Uploads must be 25 MB or smaller.")

    extension = os.path.splitext(name)[1].lower()
    if extension in {".txt", ".vtt", ".srt"}:
        transcript = contents.decode("utf-8-sig", errors="replace")
    elif extension in {".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm"}:
        try:
            result = await ai_client().audio.transcriptions.create(
                model=os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1"),
                file=(name, contents, file.content_type or "application/octet-stream"),
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(502, "Audio transcription failed. Check the AI provider and supported file format.") from exc
        transcript = result.text
    else:
        raise HTTPException(415, "Upload a .txt, .vtt, .srt, or supported audio recording.")

    if not transcript.strip():
        raise HTTPException(400, "No transcript text could be read from this file.")
    if not parse_transcript(transcript):
        transcript = f"Transcript: {transcript.strip()}"

    title = os.path.splitext(os.path.basename(name))[0].replace("_", " ").replace("-", " ").strip()
    with get_db() as c:
        mid = create_meeting(c, title or "Meeting upload", None, [], transcript)
    await generate_meeting_summary(mid)
    with get_db() as c:
        return meeting_row(c, mid)


@app.get("/api/meetings/{mid}")
def get_meeting(mid: int):
    with get_db() as c:
        d = meeting_row(c, mid)
        d["segments"] = [dict(r) for r in c.execute(
            "SELECT id,idx,speaker,start_sec,text FROM segments WHERE meeting_id=? ORDER BY idx", (mid,))]
        d["chapters"] = [dict(r) for r in c.execute(
            "SELECT id,title,start_sec FROM chapters WHERE meeting_id=? ORDER BY start_sec", (mid,))]
        d["action_items"] = [dict(r, done=bool(r["done"])) for r in c.execute(
            "SELECT id,text,assignee,due_date,done FROM action_items WHERE meeting_id=? ORDER BY id", (mid,))]
        return d


@app.patch("/api/meetings/{mid}")
def patch_meeting(mid: int, body: MeetingPatch):
    with get_db() as c:
        meeting_row(c, mid)
        if body.title is not None:
            c.execute("UPDATE meetings SET title=? WHERE id=?", (body.title, mid))
        if body.participants is not None:
            set_participants(c, mid, body.participants)
        return meeting_row(c, mid)


@app.delete("/api/meetings/{mid}", status_code=204)
def delete_meeting(mid: int):
    with get_db() as c:
        meeting_row(c, mid)
        c.execute("DELETE FROM meetings WHERE id=?", (mid,))


# action items
@app.post("/api/meetings/{mid}/action-items", status_code=201)
def add_action(mid: int, body: ActionIn):
    with get_db() as c:
        meeting_row(c, mid)
        cur = c.execute("INSERT INTO action_items(meeting_id,text,assignee,due_date) VALUES (?,?,?,?)",
                        (mid, body.text, body.assignee, body.due_date))
        return {"id": cur.lastrowid, **body.model_dump(), "done": False}


@app.patch("/api/action-items/{aid}")
def patch_action(aid: int, body: ActionPatch):
    fields = {k: (int(v) if k == "done" else v) for k, v in body.model_dump(exclude_unset=True).items()}
    if not fields:
        raise HTTPException(400, "Nothing to update")
    with get_db() as c:
        cur = c.execute(f"UPDATE action_items SET {', '.join(f'{k}=?' for k in fields)} WHERE id=?",
                        [*fields.values(), aid])
        if not cur.rowcount:
            raise HTTPException(404, "Action item not found")
        r = c.execute("SELECT id,text,assignee,due_date,done FROM action_items WHERE id=?", (aid,)).fetchone()
        return dict(r, done=bool(r["done"]))


@app.delete("/api/action-items/{aid}", status_code=204)
def delete_action(aid: int):
    with get_db() as c:
        if not c.execute("DELETE FROM action_items WHERE id=?", (aid,)).rowcount:
            raise HTTPException(404, "Action item not found")


# global search across transcripts (bonus)
@app.get("/api/search")
def global_search(q: str = Query(min_length=2)):
    with get_db() as c:
        rows = c.execute(
            "SELECT s.id seg_id, s.meeting_id, m.title, m.date, s.speaker, s.start_sec, s.text "
            "FROM segments s JOIN meetings m ON m.id=s.meeting_id WHERE s.text LIKE ? "
            "ORDER BY m.date DESC, s.idx LIMIT 50", (f"%{q}%",))
        return [dict(r) for r in rows]


# export (bonus)
@app.get("/api/meetings/{mid}/export", response_class=PlainTextResponse)
def export(mid: int, format: str = "md"):
    m = get_meeting(mid)
    ts = lambda s: f"{s // 60:02d}:{s % 60:02d}"
    md = format == "md"
    out = [f"# {m['title']}" if md else m["title"].upper(),
           f"{m['date']} | {', '.join(m['participants'])}", "",
           "## Overview" if md else "OVERVIEW", m["overview"], "",
           "## Action items" if md else "ACTION ITEMS"]
    out += [f"- [{'x' if a['done'] else ' '}] {a['text']} ({a['assignee']})" for a in m["action_items"]]
    out += ["", "## Transcript" if md else "TRANSCRIPT"]
    out += [f"[{ts(s['start_sec'])}] {s['speaker']}: {s['text']}" for s in m["segments"]]
    return "\n".join(out)


# highlights & soundbites (bonus)
class HighlightIn(BaseModel):
    segment_idx: int
    speaker: str
    start_sec: int
    text: str
    note: Optional[str] = ""
    color: Optional[str] = "#6c47ff"


class ChatIn(BaseModel):
    query: str
    meeting_id: Optional[int] = None


@app.get("/api/meetings/{mid}/highlights")
def get_highlights(mid: int):
    with get_db() as c:
        rows = c.execute("SELECT * FROM highlights WHERE meeting_id=? ORDER BY start_sec", (mid,)).fetchall()
        return [dict(r) for r in rows]


@app.post("/api/meetings/{mid}/highlights", status_code=201)
def add_highlight(mid: int, body: HighlightIn):
    with get_db() as c:
        cur = c.execute(
            "INSERT INTO highlights(meeting_id,segment_idx,speaker,start_sec,text,note,color) VALUES (?,?,?,?,?,?,?)",
            (mid, body.segment_idx, body.speaker, body.start_sec, body.text, body.note or "", body.color or "#6c47ff")
        )
        return {"id": cur.lastrowid, "meeting_id": mid, **body.model_dump()}


@app.delete("/api/highlights/{hid}", status_code=204)
def delete_highlight(hid: int):
    with get_db() as c:
        if not c.execute("DELETE FROM highlights WHERE id=?", (hid,)).rowcount:
            raise HTTPException(404, "Highlight not found")


@app.post("/api/chat")
async def ask_fred(body: ChatIn):
    if not body.query.strip():
        raise HTTPException(400, "Enter a question to ask about your meetings.")
    with get_db() as c:
        if body.meeting_id:
            m = meeting_row(c, body.meeting_id)
            segments = [dict(r) for r in c.execute(
                "SELECT speaker, start_sec, text FROM segments WHERE meeting_id=? ORDER BY idx LIMIT 100", (body.meeting_id,))]
            actions = [dict(r) for r in c.execute(
                "SELECT text, assignee, done FROM action_items WHERE meeting_id=?", (body.meeting_id,))]
            sources = [{"meeting_id": body.meeting_id, "title": m["title"], **segment} for segment in segments[:8]]
            context = {"meeting": m["title"], "overview": m["overview"], "transcript": segments, "action_items": actions}
        else:
            rows = [dict(r) for r in c.execute(
                "SELECT s.id seg_id, s.meeting_id, m.title, s.speaker, s.start_sec, s.text "
                "FROM segments s JOIN meetings m ON m.id=s.meeting_id WHERE s.text LIKE ? OR m.title LIKE ? "
                "ORDER BY m.date DESC LIMIT 12", (f"%{body.query.strip()}%", f"%{body.query.strip()}%"))]
            if not rows:
                rows = [dict(r) for r in c.execute(
                    "SELECT s.id seg_id, s.meeting_id, m.title, s.speaker, s.start_sec, s.text "
                    "FROM segments s JOIN meetings m ON m.id=s.meeting_id "
                    "ORDER BY m.date DESC LIMIT 12")]
            sources = rows
            context = rows

    if not context:
        return {"answer": "No meeting transcripts are available yet. Upload a transcript or recording first.", "sources": []}

    answer = await generate_ai_text(
        "Answer only from the supplied meeting context. Be clear when the context does not contain an answer. "
        "When useful, name the meeting and speaker; do not invent facts or citations.",
        f"Meeting context:\n{context}\n\nQuestion: {body.query.strip()}",
    )
    return {"answer": answer, "sources": sources}


# ---------- extra workspace endpoints ----------
@app.get("/api/stats")
def get_stats():
    with get_db() as c:
        m_count = c.execute("SELECT COUNT(*) n FROM meetings").fetchone()["n"]
        total_sec = c.execute("SELECT COALESCE(SUM(duration_sec), 0) s FROM meetings").fetchone()["s"]
        actions_open = c.execute("SELECT COUNT(*) n FROM action_items WHERE done=0").fetchone()["n"]
        actions_total = c.execute("SELECT COUNT(*) n FROM action_items").fetchone()["n"]
        p_count = c.execute("SELECT COUNT(*) n FROM participants").fetchone()["n"]
        return {
            "total_meetings": m_count,
            "total_duration_hours": round(total_sec / 3600, 1),
            "actions_open": actions_open,
            "actions_total": actions_total,
            "total_participants": p_count,
        }


@app.get("/api/analytics")
def get_analytics():
    with get_db() as c:
        speaker_rows = c.execute(
            "SELECT speaker, SUM(LENGTH(text) - LENGTH(REPLACE(text, ' ', '')) + 1) AS words "
            "FROM segments GROUP BY speaker ORDER BY words DESC LIMIT 10").fetchall()
        keyword_rows = c.execute("SELECT keywords FROM meetings WHERE keywords != ''").fetchall()
        meeting_count = c.execute("SELECT COUNT(*) n FROM meetings").fetchone()["n"]
        action_count = c.execute("SELECT COUNT(*) n FROM action_items").fetchone()["n"]
        open_count = c.execute("SELECT COUNT(*) n FROM action_items WHERE done=0").fetchone()["n"]
    keywords = Counter(keyword.strip() for row in keyword_rows for keyword in row["keywords"].split(",") if keyword.strip())
    return {
        "speakers": [dict(row) for row in speaker_rows],
        "keywords": [{"keyword": word, "meetings": count} for word, count in keywords.most_common(10)],
        "average_actions_per_meeting": round(action_count / meeting_count, 1) if meeting_count else 0,
        "open_actions": open_count,
    }


class AiAppIn(BaseModel):
    template: str
    meeting_id: int


@app.post("/api/ai-apps/generate")
async def generate_ai_app_output(body: AiAppIn):
    if body.template not in {"email", "battlecard", "jira"}:
        raise HTTPException(400, "Choose a supported AI template.")
    with get_db() as c:
        m = meeting_row(c, body.meeting_id)
        actions = [dict(r) for r in c.execute(
            "SELECT text, assignee, due_date, done FROM action_items WHERE meeting_id=?", (body.meeting_id,))]
        segments = [dict(r) for r in c.execute(
            "SELECT speaker, start_sec, text FROM segments WHERE meeting_id=? ORDER BY idx LIMIT 100", (body.meeting_id,))]

    instruction = {
        "email": "Write a polished, concise follow-up email with a subject, decisions, and action items.",
        "battlecard": "Create a sales battlecard grounded in the meeting, including customer needs, evidence, risks, and next steps.",
        "jira": "Create actionable Jira ticket drafts from the meeting's explicit action items. Do not invent tasks.",
    }[body.template]
    output = await generate_ai_text(
        "Create a useful work artifact using only the supplied meeting data. Do not invent names, decisions, dates, or commitments.",
        f"{instruction}\n\nMeeting data:\n{m['title']}\n{m['overview']}\n\nAction items: {actions}\n\nTranscript: {segments}",
    )
    return {"output": output, "meeting_title": m["title"]}


