"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Home, Video, Activity, Upload, Layers, BarChart2, Bot, Sparkles, 
  Users, Settings, CheckCircle2, Clock, Calendar, Shield, Zap, Plus, 
  RefreshCw, Copy, Check, ExternalLink, Mail, Key, Sliders, Play, 
  FileText, ArrowRight, UserPlus, Server, Cpu, Database
} from "lucide-react";
import { api, toast, fmtDur, fmtT, speakerColor } from "@/lib/api";

export default function WorkspaceFeaturePage({ name }: { name: string }) {
  const pageName = name.toLowerCase();

  switch (pageName) {
    case "home":
    case "dashboard":
      return <HomeView />;
    case "status":
      return <StatusView />;
    case "uploads":
      return <UploadsView />;
    case "integrations":
      return <IntegrationsView />;
    case "analytics":
      return <AnalyticsView />;
    case "voice-agents":
      return <VoiceAgentsView />;
    case "ai-apps":
      return <AiAppsView />;
    case "team":
      return <TeamView />;
    case "settings":
      return <SettingsView />;
    default:
      return (
        <div className="pad">
          <h2 style={{ textTransform: "capitalize" }}>{pageName.replace("-", " ")}</h2>
          <p className="muted">This workspace section is active.</p>
        </div>
      );
  }
}

/* ---------------- 1. DASHBOARD HOME VIEW ---------------- */
function HomeView() {
  const [stats, setStats] = useState<any>(null);
  const [recentMeetings, setRecentMeetings] = useState<any[]>([]);

  useEffect(() => {
    api("/stats").then(setStats).catch(() => {});
    api("/meetings?sort=desc").then(res => setRecentMeetings(res.slice(0, 4))).catch(() => {});
  }, []);

  return (
    <div className="pad feature-container">
      <div className="feature-header">
        <div>
          <h2>Workspace Dashboard Overview</h2>
          <p className="muted">Welcome back! Here is your meeting intelligence summary.</p>
        </div>
        <Link href="/uploads" className="btn primary glow">Upload meeting</Link>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon" style={{ background: "#efeaff", color: "#6c47ff" }}><Video size={20} /></div>
          <div>
            <div className="metric-value">{stats?.total_meetings ?? 0}</div>
            <div className="metric-label">Meetings Recorded</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon" style={{ background: "#e6fffa", color: "#00b894" }}><Clock size={20} /></div>
          <div>
            <div className="metric-value">{stats?.total_duration_hours ?? 0}h</div>
            <div className="metric-label">Recorded meeting hours</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon" style={{ background: "#fff0f6", color: "#e84393" }}><CheckCircle2 size={20} /></div>
          <div>
            <div className="metric-value">{stats?.actions_open ?? 0}</div>
            <div className="metric-label">Pending Action Items</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon" style={{ background: "#fff8e6", color: "#fdcb6e" }}><Zap size={20} /></div>
          <div>
            <div className="metric-value">{stats?.total_participants ?? 0}</div>
            <div className="metric-label">Transcript participants</div>
          </div>
        </div>
      </div>

      <div className="home-grid">
        <div className="card-panel">
          <h3>Recent Meetings & Summaries</h3>
          <div className="recent-list">
            {recentMeetings.length === 0 && <p className="muted">Your processed meetings will appear here.</p>}
            {recentMeetings.map(m => (
              <Link href={`/meetings/${m.id}`} key={m.id} className="recent-item">
                <div className="avatar sm" style={{ background: speakerColor(m.participants[0] || "A") }}>
                  {m.participants[0]?.[0] || "M"}
                </div>
                <div className="recent-info">
                  <strong>{m.title}</strong>
                  <span className="muted">{m.overview?.slice(0, 70)}...</span>
                </div>
                <span className="badge-pill">{fmtDur(m.duration_sec)}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card-panel">
          <h3>Start with a meeting</h3>
          <p className="muted">Import a transcript or recording to create a searchable summary and action list.</p>
          <Link href="/uploads" className="btn primary" style={{ marginTop: 16 }}>Upload a meeting</Link>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 2. STATUS VIEW ---------------- */
function StatusView() {
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState("");
  const refresh = () => api("/health").then(value => { setHealth(value); setError(""); })
    .catch((e: Error) => { setHealth(null); setError(e.message); });

  useEffect(() => { refresh(); }, []);

  return (
    <div className="pad feature-container">
      <div className="feature-header">
        <div>
          <h2>System & Call Capture Health</h2>
          <p className="muted">Real-time status of live call bots, speech engines, and database services.</p>
        </div>
        <button className="btn outline" onClick={refresh}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="status-grid">
        <div className="status-card active">
          <div className="status-top"><Server size={18} color={health ? "#00b894" : "#e17055"} />
            <span className={`status-badge ${health ? "green" : "blue"}`}>{health ? "ONLINE" : error ? "UNAVAILABLE" : "CHECKING"}</span></div>
          <h4>API service</h4><p className="muted">{error || "FastAPI health endpoint"}</p>
        </div>

        <div className="status-card active">
          <div className="status-top">
            <Database size={18} color="#00b894" />
            <span className={`status-badge ${health?.database === "connected" ? "green" : "blue"}`}>{health?.database || "UNKNOWN"}</span>
          </div>
          <h4>SQLite Storage Engine</h4>
          <p className="muted">Connection status from the API health check.</p>
        </div>

        <div className="status-card active">
          <div className="status-top">
            <Cpu size={18} color="#6c47ff" />
            <span className={`status-badge ${health?.ai_configured ? "green" : "blue"}`}>{health ? (health.ai_configured ? "CONFIGURED" : "NOT CONFIGURED") : "UNKNOWN"}</span>
          </div>
          <h4>Speech & AI Summarizer</h4>
          <p className="muted">AI chat and generation require an AI provider key.</p>
        </div>

        <div className="status-card active">
          <div className="status-top">
            <Bot size={18} color="#00b894" />
            <span className="status-badge blue">NOT AVAILABLE</span>
          </div>
          <h4>Fireflies Fred Bot</h4>
          <p className="muted">Live meeting bots are not configured in this deployment.</p>
        </div>
      </div>

    </div>
  );
}

/* ---------------- 3. UPLOADS VIEW ---------------- */
function UploadsView() {
  const [uploaded, setUploaded] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api("/meetings").then(setUploaded).catch((error: Error) => toast(error.message));
  }, []);

  const handleUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const meeting = await api("/uploads", { method: "POST", body: form });
      setUploaded((items: any[]) => [{ id: meeting.id, title: meeting.title }, ...items]);
      toast("Meeting transcript processed.");
    } catch (error: any) {
      toast(error.message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="pad feature-container">
      <div className="feature-header">
        <div>
          <h2>Transcript & Audio Upload Hub</h2>
          <p className="muted">Upload past meeting transcripts or recordings to extract AI summaries & action items.</p>
        </div>
      </div>

      <div className="file-upload-box large" style={{ marginBottom: 24 }}>
        <Upload size={32} color="#6c47ff" />
        <h4>{loading ? "Processing upload..." : "Choose a transcript or recording"}</h4>
        <p className="muted">Transcript files work without an AI key. Audio transcription requires provider configuration.</p>
        <input type="file" accept=".txt,.vtt,.srt,.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm" onChange={handleUpload} disabled={loading} />
      </div>

      <div className="card-panel">
        <h3>Upload History</h3>
        <table className="custom-table">
          <thead><tr><th>MEETING</th><th>DATE</th><th>ACTION</th></tr></thead>
          <tbody>
            {uploaded.map(item => <tr key={item.id}><td><strong>{item.title}</strong></td><td>{new Date(item.date).toLocaleDateString()}</td><td><Link href={`/meetings/${item.id}`} className="btn outline sm">View meeting</Link></td></tr>)}
            {uploaded.length === 0 && <tr><td colSpan={3} className="muted">No meetings uploaded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- 4. INTEGRATIONS VIEW ---------------- */
function IntegrationsView() {
  return (
    <div className="pad feature-container">
      <div className="feature-header">
        <div>
          <h2>Integrations Marketplace</h2>
          <p className="muted">No external integrations are configured for this deployment.</p>
        </div>
      </div>

      <p className="muted">Calendar capture, CRM sync, and chat notifications need provider-specific OAuth credentials and callbacks.</p>
    </div>
  );
}

/* ---------------- 5. ANALYTICS VIEW ---------------- */
function AnalyticsView() {
  const [analytics, setAnalytics] = useState<any>(null);
  useEffect(() => { api("/analytics").then(setAnalytics).catch(() => setAnalytics(null)); }, []);

  return (
    <div className="pad feature-container">
      <div className="feature-header">
        <div>
          <h2>Conversation Analytics</h2>
          <p className="muted">Explore speaker activity, recurring transcript topics, and follow-up workload.</p>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div>
            <div className="metric-value">{analytics?.open_actions ?? "—"}</div>
            <div className="metric-label">Open action items</div>
          </div>
        </div>

        <div className="metric-card">
          <div>
            <div className="metric-value">{analytics?.average_actions_per_meeting ?? "—"}</div>
            <div className="metric-label">Actions per meeting</div>
          </div>
        </div>

        <div className="metric-card">
          <div>
            <div className="metric-value">{analytics?.speakers?.length ?? "—"}</div>
            <div className="metric-label">Distinct speakers</div>
          </div>
        </div>
      </div>

      <div className="home-grid" style={{ marginTop: 24 }}>
        <div className="card-panel">
          <h3>Top Speakers Leaderboard</h3>
          <div className="speaker-analytics-list">
            {!analytics?.speakers?.length && <p className="muted">Speaker activity appears after you upload a transcript.</p>}
            {analytics?.speakers?.map((speaker: any) => <div className="sa-row" key={speaker.speaker}>
              <div className="avatar sm" style={{ background: speakerColor(speaker.speaker) }}>{speaker.speaker[0]}</div>
              <div className="sa-info"><strong>{speaker.speaker}</strong><div className="bar-wrap"><div className="bar" style={{ width: `${Math.max(4, Math.min(100, speaker.words / Math.max(1, analytics.speakers[0].words) * 100))}%` }} /></div></div>
              <span>{speaker.words} words</span>
            </div>)}
          </div>
        </div>

        <div className="card-panel">
          <h3>Top Recurring Keywords</h3>
          <div className="chips" style={{ marginTop: 12 }}>
            {!analytics?.keywords?.length && <p className="muted">Keywords appear after you upload a transcript.</p>}
            {analytics?.keywords?.map((item: any) => <span className="lg" key={item.keyword}>{item.keyword} · {item.meetings} {item.meetings === 1 ? "meeting" : "meetings"}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 6. VOICE AGENTS / BOT SETTINGS ---------------- */
function VoiceAgentsView() {
  return (
    <div className="pad feature-container">
      <div className="feature-header">
        <div>
          <h2>Live meeting capture</h2>
          <p className="muted">Live meeting capture is not available in this deployment.</p>
        </div>
      </div>

      <div className="card-panel" style={{ maxWidth: 640 }}>
        <h3>Meeting ingestion</h3>
        <p className="muted">Upload a transcript or recording from the Uploads page to create a meeting. Calendar-based auto-join requires a separate bot service and provider credentials.</p>
        <Link href="/uploads" className="btn primary" style={{ marginTop: 16 }}>Upload a meeting</Link>
      </div>
    </div>
  );
}

/* ---------------- 7. AI APPS VIEW ---------------- */
function AiAppsView() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [selectedMid, setSelectedMid] = useState<number>(0);
  const [template, setTemplate] = useState("email");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api("/meetings").then(res => {
      setMeetings(res);
      if (res.length > 0) setSelectedMid(res[0].id);
    }).catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!selectedMid) return;
    setLoading(true);
    try {
      const res = await api("/ai-apps/generate", {
        method: "POST",
        body: JSON.stringify({ template, meeting_id: selectedMid })
      });
      setOutput(res.output);
      toast("✨ AI document generated successfully!");
    } catch (err: any) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pad feature-container">
      <div className="feature-header">
        <div>
          <h2>AI Prompt Generators & Templates</h2>
          <p className="muted">Generate executive follow-up emails, sales battlecards, or Jira ticket batches instantly.</p>
        </div>
      </div>

      <div className="home-grid">
        <div className="card-panel">
          <h3>Generator Config</h3>
          <div className="form-group">
            <label>Select Meeting</label>
            <select value={selectedMid} onChange={e => setSelectedMid(+e.target.value)}>
              {meetings.map(m => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
            {meetings.length === 0 && <p className="muted">Upload a meeting transcript before generating an AI document.</p>}
          </div>

          <div className="form-group" style={{ marginTop: 14 }}>
            <label>Choose AI App Template</label>
            <select value={template} onChange={e => setTemplate(e.target.value)}>
              <option value="email">📧 Executive Follow-up Email</option>
              <option value="battlecard">⚔️ Sales Battlecard & Pain Points</option>
              <option value="jira">📋 Jira Action Item Tickets</option>
            </select>
          </div>

          <button className="btn primary glow" style={{ marginTop: 18 }} onClick={handleGenerate} disabled={loading || !selectedMid}>
            {loading ? "Generating..." : "⚡ Generate AI Output"}
          </button>
        </div>

        <div className="card-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Generated Result</h3>
            {output && (
              <button className="btn outline sm" onClick={() => { navigator.clipboard.writeText(output); toast("Copied to clipboard!"); }}>
                <Copy size={13} /> Copy Text
              </button>
            )}
          </div>
          <textarea 
            rows={14} 
            value={output} 
            placeholder="Click 'Generate AI Output' to see instant results..." 
            readOnly 
            style={{ width: "100%", marginTop: 12, fontFamily: "monospace" }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------------- 8. TEAM VIEW ---------------- */
function TeamView() {
  return (
    <div className="pad feature-container">
      <div className="feature-header">
        <div>
          <h2>Team & Workspace Members</h2>
          <p className="muted">This installation does not have user accounts or workspace invitations enabled.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 9. SETTINGS VIEW ---------------- */
function SettingsView() {
  const [health, setHealth] = useState<any>(null);
  useEffect(() => { api("/health").then(setHealth).catch(() => setHealth(null)); }, []);

  return (
    <div className="pad feature-container">
      <div className="feature-header">
        <div>
          <h2>Workspace Settings</h2>
          <p className="muted">Service credentials are configured in the deployment environment and are never exposed in the browser.</p>
        </div>
      </div>

      <div className="card-panel" style={{ maxWidth: 600 }}>
        <h3>Deployment status</h3>
        <p>Backend: {health?.status || "Unavailable"}</p>
        <p>Database: {health?.database || "Unavailable"}</p>
        <p>AI provider: {health ? (health.ai_configured ? "Configured" : "Not configured") : "Unavailable"}</p>
        <p className="muted" style={{ marginTop: 14 }}>Set OPENAI_API_KEY on the backend to enable AskFred, AI templates, and audio transcription.</p>
      </div>
    </div>
  );
}
