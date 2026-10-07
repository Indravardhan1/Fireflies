"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { 
  Play, Pause, Search, Trash2, Pencil, Download, Volume2, 
  RotateCcw, RotateCw, Bookmark, Sparkles, Plus, Check, Edit2, 
  FileText, MessageSquare, ListTodo, Star, Share2, Printer
} from "lucide-react";
import { api, downloadExport, fmtT, toast, speakerColor } from "@/lib/api";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [m, setM] = useState<any>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [ttsEnabled, setTtsEnabled] = useState(false);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"summary" | "tasks" | "chapters" | "highlights" | "ai">("summary");
  const [newTask, setNewTask] = useState("");
  const [edit, setEdit] = useState<{ title: string; participants: string } | null>(null);

  // Soundbites / Highlights state
  const [highlights, setHighlights] = useState<any[]>([]);
  const [highlightNote, setHighlightNote] = useState("");

  // In-Meeting AI Chat state
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Ask me anything about this specific meeting! E.g. 'What were the action items?' or 'Summarize Maria's points'." }
  ]);
  const [aiLoading, setAiLoading] = useState(false);

  // Load meeting details & highlights
  const load = () => {
    api(`/meetings/${id}`).then(setM).catch(e => toast(e.message));
    api(`/meetings/${id}/highlights`).then(setHighlights).catch(() => {});
  };

  useEffect(() => { load(); }, [id]);

  // Read jump timestamp from URL query param e.g. ?t=45
  useEffect(() => {
    const tParam = searchParams.get("t");
    if (tParam && !isNaN(+tParam)) {
      setT(+tParam);
      setPlaying(true);
    }
  }, [searchParams]);

  // Audio Playback timer
  useEffect(() => {
    if (!playing || !m) return;
    const intervalTime = 1000 / playbackSpeed;
    const i = setInterval(() => {
      setT(x => {
        if (x + 1 >= m.duration_sec) {
          setPlaying(false);
          return m.duration_sec;
        }
        return x + 1;
      });
    }, intervalTime);
    return () => clearInterval(i);
  }, [playing, m, playbackSpeed]);

  // Compute current active segment index
  const activeIdx = m ? m.segments.reduce((a: number, s: any, i: number) => (s.start_sec <= t ? i : a), -1) : -1;
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active segment into view
  useEffect(() => {
    if (activeIdx !== -1) {
      activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      
      // Optional SpeechSynthesis Web Speech API for realistic readout
      if (ttsEnabled && playing && typeof window !== "undefined" && "speechSynthesis" in window) {
        const seg = m.segments[activeIdx];
        if (seg) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(seg.text);
          u.rate = playbackSpeed;
          window.speechSynthesis.speak(u);
        }
      }
    }
  }, [activeIdx, ttsEnabled, playing]);

  if (!m) return <div className="loading-state pad">Loading meeting details...</div>;

  const seek = (s: number) => { 
    setT(s); 
    setPlaying(true); 
  };

  const hl = (text: string) => {
    if (!q) return text;
    return text.split(new RegExp(`(${esc(q)})`, "ig")).map((p, i) => 
      p.toLowerCase() === q.toLowerCase() ? <mark key={i}>{p}</mark> : p
    );
  };

  const hits = q ? m.segments.filter((s: any) => s.text.toLowerCase().includes(q.toLowerCase())).length : 0;

  const patchTask = async (a: any, body: any) => { 
    await api(`/action-items/${a.id}`, { method: "PATCH", body: JSON.stringify(body) }); 
    load(); 
  };

  const saveMeetingMeta = async () => { 
    await api(`/meetings/${id}`, { 
      method: "PATCH", 
      body: JSON.stringify({ 
        title: edit!.title, 
        participants: edit!.participants.split(",").map(s => s.trim()).filter(Boolean) 
      }) 
    }); 
    setEdit(null); 
    toast("Meeting updated"); 
    load(); 
  };

  const addSoundbite = async (seg: any) => {
    try {
      await api(`/meetings/${id}/highlights`, {
        method: "POST",
        body: JSON.stringify({
          segment_idx: seg.idx,
          speaker: seg.speaker,
          start_sec: seg.start_sec,
          text: seg.text,
          note: "Highlighted Soundbite"
        })
      });
      toast("⭐ Soundbite saved to highlights!");
      load();
    } catch (e: any) {
      toast(e.message);
    }
  };

  const removeSoundbite = async (hid: number) => {
    await api(`/highlights/${hid}`, { method: "DELETE" });
    toast("Highlight removed");
    load();
  };

  const handleInMeetingAi = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const prompt = aiInput;
    setAiMessages(prev => [...prev, { role: "user", text: prompt }]);
    setAiInput("");
    setAiLoading(true);

    try {
      const res = await api("/chat", {
        method: "POST",
        body: JSON.stringify({ query: prompt, meeting_id: +id })
      });
      setAiMessages(prev => [...prev, { role: "ai", text: res.answer }]);
    } catch (err: any) {
      setAiMessages(prev => [...prev, { role: "ai", text: "Failed to generate answer for this meeting." }]);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="detail">
      {/* Detail Header */}
      <div className="dhead">
        {edit ? (
          <div className="editrow">
            <input 
              value={edit.title} 
              onChange={e => setEdit({ ...edit, title: e.target.value })} 
              placeholder="Title"
            />
            <input 
              value={edit.participants} 
              onChange={e => setEdit({ ...edit, participants: e.target.value })} 
              placeholder="Participants (comma separated)"
            />
            <button className="btn primary sm" onClick={saveMeetingMeta}>Save</button>
            <button className="btn outline sm" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        ) : (
          <div>
            <h2>{m.title}</h2>
            <div className="muted meta-info">
              {new Date(m.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {m.participants.join(", ")}
            </div>
          </div>
        )}

        <div className="dact">
          <button className="btn outline sm" onClick={() => setEdit({ title: m.title, participants: m.participants.join(", ") })}>
            <Pencil size={14} /> Edit
          </button>

          <button className="btn outline sm" onClick={() => downloadExport(+id, "md").catch((error: Error) => toast(error.message))}>
            <Download size={14} /> Export MD
          </button>

          <button className="btn outline sm" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </button>

          <button className="btn outline sm danger" onClick={async () => {
            if (confirm("Are you sure you want to delete this meeting?")) {
              await api(`/meetings/${id}`, { method: "DELETE" });
              toast("Meeting deleted");
              router.push("/");
            }
          }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {/* Audio Playback Bar */}
      <div className="player-card">
        <div className="player-controls">
          <button className="player-btn" onClick={() => seek(Math.max(0, t - 10))} title="Back 10s">
            <RotateCcw size={15} />
          </button>

          <button className="player-play-btn glow" onClick={() => setPlaying(p => !p)}>
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <button className="player-btn" onClick={() => seek(Math.min(m.duration_sec, t + 10))} title="Forward 10s">
            <RotateCw size={15} />
          </button>
        </div>

        <span className="time-code">{fmtT(t)}</span>
        
        <div className="scrubber-wrap">
          <input 
            type="range" 
            min={0} 
            max={m.duration_sec} 
            value={t} 
            onChange={e => setT(+e.target.value)} 
            className="scrubber"
          />
          {playing && <div className="waveform-anim" />}
        </div>

        <span className="time-code">{fmtT(m.duration_sec)}</span>

        <div className="player-options">
          <button 
            className={`speed-badge ${ttsEnabled ? "active" : ""}`}
            onClick={() => {
              setTtsEnabled(!ttsEnabled);
              toast(ttsEnabled ? "Audio TTS readout disabled" : "Audio TTS readout enabled");
            }}
            title="Read out loud using Text to Speech"
          >
            <Volume2 size={13} /> {ttsEnabled ? "TTS ON" : "TTS"}
          </button>

          <select 
            value={playbackSpeed} 
            onChange={e => setPlaybackSpeed(+e.target.value)}
            className="speed-select"
          >
            <option value={0.75}>0.75x</option>
            <option value={1}>1.0x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2.0x</option>
          </select>
        </div>
      </div>

      {/* Split Columns Area */}
      <div className="cols">
        {/* Left Column: Interactive Transcript */}
        <div className="transcript-panel">
          <div className="tsearch">
            <Search size={14} />
            <input 
              placeholder="Search in transcript..." 
              value={q} 
              onChange={e => setQ(e.target.value)} 
            />
            {q && <span className="matches-badge">{hits} matches</span>}
          </div>

          <div className="tscroll">
            {m.segments.map((s: any, i: number) => {
              const isHighlight = highlights.some(h => h.segment_idx === s.idx);
              return (
                <div 
                  key={s.id} 
                  ref={i === activeIdx ? activeRef : null} 
                  className={`seg ${i === activeIdx ? "act" : ""} ${isHighlight ? "highlighted" : ""}`} 
                  onClick={() => seek(s.start_sec)}
                >
                  <div className="who">
                    <div className="avatar sm" style={{ background: speakerColor(s.speaker) }}>
                      {s.speaker[0]}
                    </div>
                    <b>{s.speaker}</b>
                    <span className="ts">[{fmtT(s.start_sec)}]</span>

                    <div className="seg-actions" onClick={e => e.stopPropagation()}>
                      <button className="seg-btn" onClick={() => addSoundbite(s)} title="Save Soundbite Highlight">
                        <Star size={13} color={isHighlight ? "#fdcb6e" : "#8a90a2"} fill={isHighlight ? "#fdcb6e" : "none"} />
                      </button>
                    </div>
                  </div>
                  <p>{hl(s.text)}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Side Panel */}
        <aside className="side">
          <div className="tabs">
            <button className={tab === "summary" ? "on" : ""} onClick={() => setTab("summary")}>Overview</button>
            <button className={tab === "tasks" ? "on" : ""} onClick={() => setTab("tasks")}>Action Items</button>
            <button className={tab === "chapters" ? "on" : ""} onClick={() => setTab("chapters")}>Chapters</button>
            <button className={tab === "highlights" ? "on" : ""} onClick={() => setTab("highlights")}>Soundbites</button>
            <button className={tab === "ai" ? "on" : ""} onClick={() => setTab("ai")}>AskFred</button>
          </div>

          {/* SUMMARY TAB */}
          {tab === "summary" && (
            <div className="tab-content">
              <h4>AI Overview</h4>
              <p className="summary-p">{m.overview || "No overview available."}</p>
              
              <h4>Keywords & Topics</h4>
              <div className="chips">
                {m.keywords.map((k: string) => (
                  <span key={k} onClick={() => setQ(k)} title="Click to filter transcript">{k}</span>
                ))}
              </div>
            </div>
          )}

          {/* ACTION ITEMS TAB */}
          {tab === "tasks" && (
            <div className="tab-content">
              <h4>Action Items ({m.action_items.filter((x: any) => x.done).length}/{m.action_items.length})</h4>
              <div className="task-list">
                {m.action_items.map((a: any) => (
                  <div className="task" key={a.id}>
                    <input 
                      type="checkbox" 
                      checked={a.done} 
                      onChange={() => { 
                        patchTask(a, { done: !a.done }); 
                        toast(a.done ? "Task reopened" : "Task completed"); 
                      }} 
                    />
                    <span 
                      className={a.done ? "done" : ""} 
                      onDoubleClick={() => { 
                        const v = prompt("Edit action item", a.text); 
                        if (v) patchTask(a, { text: v }); 
                      }}
                    >
                      {a.text}
                      {a.assignee && <small>Assigned to {a.assignee}</small>}
                    </span>
                    <Trash2 
                      size={13} 
                      className="task-del" 
                      onClick={async () => { 
                        await api(`/action-items/${a.id}`, { method: "DELETE" }); 
                        load(); 
                      }} 
                    />
                  </div>
                ))}
              </div>

              <div className="addtask">
                <input 
                  placeholder="Add action item (press Enter)..." 
                  value={newTask} 
                  onChange={e => setNewTask(e.target.value)} 
                  onKeyDown={async e => { 
                    if (e.key === "Enter" && newTask.trim()) { 
                      await api(`/meetings/${id}/action-items`, { 
                        method: "POST", 
                        body: JSON.stringify({ text: newTask }) 
                      }); 
                      setNewTask(""); 
                      load(); 
                      toast("Action item added");
                    } 
                  }} 
                />
              </div>
              <p className="muted note-hint">Tip: Double-click an action item to edit text.</p>
            </div>
          )}

          {/* CHAPTERS TAB */}
          {tab === "chapters" && (
            <div className="tab-content">
              <h4>Meeting Outline</h4>
              {m.chapters.map((c: any) => (
                <div key={c.id} className="chap" onClick={() => seek(c.start_sec)}>
                  <span className="ts">[{fmtT(c.start_sec)}]</span>
                  <span className="chap-title">{c.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* SOUNDBITES / HIGHLIGHTS TAB */}
          {tab === "highlights" && (
            <div className="tab-content">
              <h4>Starred Soundbites ({highlights.length})</h4>
              {!highlights.length && <p className="muted">No soundbites saved yet. Hover any transcript segment and click ⭐ to save!</p>}
              {highlights.map(h => (
                <div key={h.id} className="highlight-card" onClick={() => seek(h.start_sec)}>
                  <div className="hl-header">
                    <span className="hl-speaker">{h.speaker}</span>
                    <span className="ts">[{fmtT(h.start_sec)}]</span>
                    <Trash2 size={12} className="hl-del" onClick={(e) => { e.stopPropagation(); removeSoundbite(h.id); }} />
                  </div>
                  <p className="hl-text">"{h.text}"</p>
                </div>
              ))}
            </div>
          )}

          {/* ASK FRED IN-MEETING TAB */}
          {tab === "ai" && (
            <div className="tab-content in-meeting-ai">
              <h4><Sparkles size={14} color="#6c47ff" /> AskFred about this call</h4>
              <div className="in-ai-box">
                {aiMessages.map((msg, i) => (
                  <div key={i} className={`in-ai-msg ${msg.role}`}>
                    <p style={{ whiteSpace: "pre-wrap" }}>{msg.text}</p>
                  </div>
                ))}
                {aiLoading && <div className="in-ai-msg ai loading">Analyzing transcript...</div>}
              </div>

              <div className="in-ai-input">
                <input 
                  placeholder="Ask a question about this meeting..." 
                  value={aiInput} 
                  onChange={e => setAiInput(e.target.value)} 
                  onKeyDown={e => { if (e.key === "Enter") handleInMeetingAi(); }}
                />
                <button className="btn primary sm" onClick={handleInMeetingAi} disabled={!aiInput.trim() || aiLoading}>Ask</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
