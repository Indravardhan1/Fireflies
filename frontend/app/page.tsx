"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { 
  Hash, LayoutGrid, List, Users, Plus, Calendar, Clock, Trash2, 
  ArrowUpDown, Star, FileText, CheckSquare, Sparkles, FolderPlus, UploadCloud, Search
} from "lucide-react";
import { api, fmtDur, toast, speakerColor } from "@/lib/api";

const weekOf = (d: Date) => { 
  const s = new Date(d); 
  s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); 
  const e = new Date(s); 
  e.setDate(s.getDate() + 6);
  const f = (x: Date) => x.toLocaleDateString("en-US", { month: "short", day: "numeric" }); 
  return `${f(s)} - ${f(e)}`; 
};

export default function Library() {
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const [person, setPerson] = useState("");
  const [from, setFrom] = useState("");
  const [sort, setSort] = useState("desc");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  useEffect(() => setQ(sp.get("q") || ""), [sp]);

  const load = useCallback(() => {
    const p = new URLSearchParams({ q, participant: person, date_from: from, sort });
    api("/meetings?" + p)
      .then(setMeetings)
      .catch(e => toast(e.message))
      .finally(() => setLoading(false));
  }, [q, person, from, sort]);

  useEffect(load, [load]);

  const groups: Record<string, any[]> = {};
  meetings.forEach(m => (groups[weekOf(new Date(m.date))] ||= []).push(m));

  const del = async (m: any) => { 
    if (!confirm(`Are you sure you want to delete "${m.title}"?`)) return; 
    await api(`/meetings/${m.id}`, { method: "DELETE" }); 
    toast("Meeting deleted"); 
    load(); 
  };

  return (
    <div className="lib">
      {/* Channels Sidebar */}
      <aside className="channels">
        <div className="channel-group-title">WORKSPACE</div>
        <a className="on"><Hash size={14} /> Meetings</a>
        <p className="muted">Meetings uploaded to this workspace.</p>
      </aside>

      {/* Main Content Area */}
      <section className="list">
        {/* Filters and Controls */}
        <div className="filters-bar">
          <div className="search-filters">
            <div className="input-with-icon">
              <Search size={14} className="icon" />
              <input 
                placeholder="Filter title or keywords..." 
                value={q} 
                onChange={e => setQ(e.target.value)} 
              />
            </div>
            <input 
              placeholder="Participant name" 
              value={person} 
              onChange={e => setPerson(e.target.value)} 
            />
            <input 
              type="date" 
              value={from} 
              onChange={e => setFrom(e.target.value)} 
            />
          </div>

          <div className="filter-actions">
            <button 
              className="btn outline icon-only" 
              onClick={() => setViewMode(v => v === "list" ? "grid" : "list")}
              title={`Switch to ${viewMode === "list" ? "Grid" : "List"} view`}
            >
              {viewMode === "list" ? <LayoutGrid size={14} /> : <List size={14} />}
            </button>
            <button className="btn outline" onClick={() => setSort(s => s === "desc" ? "asc" : "desc")}>
              <ArrowUpDown size={13} /> {sort === "desc" ? "Newest" : "Oldest"}
            </button>
            <button className="btn primary glow" onClick={() => setModal(true)}>
              <Plus size={14} /> Add Meeting
            </button>
          </div>
        </div>

        {loading && <div className="loading-state">Loading workspace meetings...</div>}

        {!loading && !meetings.length && (
          <div className="empty-state">
            <Sparkles size={32} color="#6c47ff" />
            <h3>No meetings found</h3>
            <p>Upload a transcript or create a new meeting to populate your library.</p>
            <button className="btn primary" onClick={() => setModal(true)}>+ Add Your First Meeting</button>
          </div>
        )}

        {/* LIST VIEW */}
        {!loading && viewMode === "list" && (
          <div className="table-container">
            <div className="row head">
              <span />
              <span>MEETING TITLE</span>
              <span>DATE</span>
              <span>TIME</span>
              <span>DURATION</span>
              <span>PARTICIPANTS</span>
              <span />
            </div>

            {Object.entries(groups).map(([wk, ms]) => (
              <div key={wk} className="week-group">
                <h4 className="grp">{wk} <span>· {ms.length} Meetings</span></h4>
                {ms.map(m => {
                  const d = new Date(m.date);
                  const firstSpeaker = m.participants[0] || "Guest";
                  return (
                    <Link href={`/meetings/${m.id}`} key={m.id} className="row meeting-row">
                      <div className="avatar sm" style={{ background: speakerColor(firstSpeaker) }}>
                        {firstSpeaker[0]}
                      </div>
                      <div className="meeting-title-col">
                        <b>{m.title}</b>
                        {m.keywords && m.keywords.length > 0 && (
                          <div className="row-chips">
                            {m.keywords.slice(0, 3).map((k: string) => <span key={k} className="row-chip">{k}</span>)}
                          </div>
                        )}
                      </div>
                      <span className="meta-text">
                        <Calendar size={13} /> {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                      <span className="meta-text">
                        <Clock size={13} /> {d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="badge-pill">{fmtDur(m.duration_sec)}</span>
                      <div className="participants-stack">
                        {m.participants.slice(0, 3).map((p: string, idx: number) => (
                          <span key={idx} className="p-avatar" style={{ background: speakerColor(p) }} title={p}>
                            {p[0]}
                          </span>
                        ))}
                        {m.participants.length > 3 && <small>+{m.participants.length - 3}</small>}
                      </div>
                      <span 
                        title="Delete meeting"
                        className="del"
                        onClick={e => { e.preventDefault(); del(m); }} 
                      >
                        <Trash2 size={15} />
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* GRID VIEW */}
        {!loading && viewMode === "grid" && (
          <div className="grid-container">
            {meetings.map(m => {
              const d = new Date(m.date);
              return (
                <div key={m.id} className="grid-card" onClick={() => window.location.href = `/meetings/${m.id}`}>
                  <div className="card-top">
                    <span className="badge-pill">{fmtDur(m.duration_sec)}</span>
                    <Trash2 
                      size={15} 
                      className="del-card" 
                      onClick={e => { e.stopPropagation(); del(m); }} 
                    />
                  </div>
                  <h3>{m.title}</h3>
                  <p className="card-overview">{m.overview || "Click to view full transcript & AI summaries."}</p>
                  <div className="card-footer">
                    <div className="meta-text">
                      <Calendar size={12} /> {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                    <div className="participants-stack">
                      {m.participants.slice(0, 3).map((p: string, idx: number) => (
                        <span key={idx} className="p-avatar" style={{ background: speakerColor(p) }} title={p}>
                          {p[0]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Add Meeting Modal */}
      {modal && <AddModal onClose={() => setModal(false)} onDone={() => { setModal(false); load(); }} />}
    </div>
  );
}

function AddModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ title: "", participants: "", transcript: "" });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!f.title || !f.transcript) return;
    setLoading(true);
    try { 
      await api("/meetings", { 
        method: "POST", 
        body: JSON.stringify({ 
          title: f.title, 
          transcript: f.transcript,
          participants: f.participants.split(",").map(s => s.trim()).filter(Boolean) 
        }) 
      }); 
      toast("✨ Meeting created! AI Summary & Action Items generated."); 
      onDone(); 
    } catch (e: any) { 
      toast(e.message); 
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create / Upload Meeting</h3>
          <p className="muted">Add a meeting transcript to extract AI notes, action items & chapters.</p>
        </div>

        <div className="form-group">
          <label>Meeting Title *</label>
          <input 
            placeholder="e.g. Q4 Strategy Sync" 
            value={f.title} 
            onChange={e => setF({ ...f, title: e.target.value })} 
          />
        </div>

        <div className="form-group">
          <label>Participants (Optional, comma separated)</label>
          <input 
              placeholder="e.g. Alex Morgan, Sam Taylor"
            value={f.participants} 
            onChange={e => setF({ ...f, participants: e.target.value })} 
          />
        </div>

        <div className="form-group">
          <label>Upload Transcript File (.txt)</label>
          <div className="file-upload-box">
            <UploadCloud size={20} color="#6c47ff" />
            <span>Click or drag a .txt transcript file</span>
            <input 
              type="file" 
              accept=".txt" 
              onChange={async e => { 
                const file = e.target.files?.[0]; 
                if (file) {
                  setF({ 
                    ...f, 
                    transcript: await file.text(), 
                    title: f.title || file.name.replace(/\.\w+$/, "") 
                  }); 
                  toast(`Loaded ${file.name}`);
                }
              }} 
            />
          </div>
        </div>

        <div className="form-group">
          <label>Or Paste Raw Transcript Text *</label>
          <textarea 
            rows={7} 
            placeholder={"[00:00] Alice: Welcome everyone to the team sync.\n[00:15] Bob: Thanks Alice! I'll present the sales updates..."} 
            value={f.transcript} 
            onChange={e => setF({ ...f, transcript: e.target.value })} 
          />
        </div>

        <div className="actions">
          <button className="btn outline" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn primary glow" disabled={!f.title || !f.transcript || loading} onClick={submit}>
            {loading ? "Processing AI..." : "Create & Analyze"}
          </button>
        </div>
      </div>
    </div>
  );
}
