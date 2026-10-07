"use client";
import { Suspense, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  Home, Video, Activity, Upload, Layers, BarChart2, Bot, Sparkles,
  Users, Settings, Search, X, ArrowRight, Sparkle, Sun, Moon, Send, MessageSquare
} from "lucide-react";
import { api, toast, fmtT } from "@/lib/api";

const NAV: [any, string, string][] = [
  [Home, "/dashboard", "Dashboard"], 
  [Video, "/", "Meetings"], 
  [Activity, "/status", "Status"],
  [Upload, "/uploads", "Uploads"], 
  [Layers, "/integrations", "Integrations"], 
  [BarChart2, "/analytics", "Analytics"],
  [Bot, "/voice-agents", "Voice Agents"], 
  [Sparkles, "/ai-apps", "AI Apps"], 
  [Users, "/team", "Team"], 
  [Settings, "/settings", "Settings"]
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(), router = useRouter();
  const [toasts, setToasts] = useState<{ id: number; m: string }[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  
  // Search Overlay State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ meetings: any[]; segments: any[] }>({ meetings: [], segments: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

interface ChatMsg { role: "user" | "ai"; text: string; sources?: any[]; }

  // AskFred Modal State
  const [askOpen, setAskOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    const isDark = localStorage.getItem("theme") === "dark";
    setDarkMode(isDark);
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  useEffect(() => {
    const h = (e: any) => { 
      const id = Date.now(); 
      setToasts(t => [...t, { id, m: e.detail }]); 
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000); 
    };
    window.addEventListener("toast", h); 
    return () => window.removeEventListener("toast", h);
  }, []);

  // Realtime global search query listener
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults({ meetings: [], segments: [] });
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [mRes, sRes] = await Promise.all([
          api(`/meetings?q=${encodeURIComponent(searchQuery)}`),
          api(`/search?q=${encodeURIComponent(searchQuery)}`)
        ]);
        setSearchResults({ meetings: mRes || [], segments: sRes || [] });
      } catch (err) {
        console.error(err);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside listener for search overlay
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAskSubmit = async (queryText?: string) => {
    const prompt = queryText || chatInput;
    if (!prompt.trim() || chatLoading) return;
    
    setChatHistory(prev => [...prev, { role: "user", text: prompt }]);
    if (!queryText) setChatInput("");
    setChatLoading(true);

    try {
      const res = await api("/chat", {
        method: "POST",
        body: JSON.stringify({ query: prompt })
      });
      setChatHistory(prev => [...prev, { role: "ai", text: res.answer, sources: res.sources }]);
    } catch (e: any) {
      setChatHistory(prev => [...prev, { role: "ai", text: "Sorry, I ran into an error generating an answer. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className={`app ${darkMode ? "dark" : ""}`}>
      <div className="body">
        <nav className="rail">
          <div className="logo" onClick={() => router.push("/")}>f</div>
          {NAV.map(([Icon, href, label]) => (
            <Link 
              key={label} 
              href={href} 
              title={label} 
              className={(href === "/" ? path === "/" || path.startsWith("/meetings") : path === href) ? "on" : ""}
            >
              <Icon size={18} />
            </Link>
          ))}
          <div className="rail-bottom">
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle Theme">
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </nav>

        <div className="main">
          <header className="top">
            <div className="search-wrap" ref={searchRef}>
              <div className="search">
                <Search size={15} />
                <input 
                  placeholder="Search by title, participant, or keyword..." 
                  value={searchQuery}
                  onFocus={() => setSearchOpen(true)}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && searchQuery.trim()) {
                      setSearchOpen(false);
                      router.push(`/?q=${encodeURIComponent(searchQuery)}`);
                    }
                  }}
                />
                {searchQuery && <X size={14} className="clear-icon" onClick={() => setSearchQuery("")} />}
              </div>

              {/* Instant Search Overlay */}
              {searchOpen && (searchQuery.length >= 2) && (
                <div className="search-overlay">
                  {searchLoading && <div className="search-overlay-loading">Searching meetings & transcripts...</div>}
                  
                  {!searchLoading && !searchResults.meetings.length && !searchResults.segments.length && (
                    <div className="search-overlay-empty">No results found for "{searchQuery}"</div>
                  )}

                  {!searchLoading && searchResults.meetings.length > 0 && (
                    <div className="search-section">
                      <div className="search-section-title">Meetings ({searchResults.meetings.length})</div>
                      {searchResults.meetings.slice(0, 4).map(m => (
                        <div 
                          key={m.id} 
                          className="search-item" 
                          onClick={() => {
                            setSearchOpen(false);
                            router.push(`/meetings/${m.id}`);
                          }}
                        >
                          <Video size={14} className="search-icon" />
                          <div className="search-item-info">
                            <div className="search-item-title">{m.title}</div>
                            <div className="search-item-sub">{m.participants?.join(", ")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!searchLoading && searchResults.segments.length > 0 && (
                    <div className="search-section">
                      <div className="search-section-title">Transcript Matches ({searchResults.segments.length})</div>
                      {searchResults.segments.slice(0, 5).map(s => (
                        <div 
                          key={s.seg_id} 
                          className="search-item"
                          onClick={() => {
                            setSearchOpen(false);
                            router.push(`/meetings/${s.meeting_id}?t=${s.start_sec}`);
                          }}
                        >
                          <MessageSquare size={14} className="search-icon" />
                          <div className="search-item-info">
                            <div className="search-item-title">
                              <span>{s.speaker}</span> <small className="ts-tag">[{fmtT(s.start_sec)}]</small> — <i>{s.title}</i>
                            </div>
                            <div className="search-item-sub">"{s.text}"</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Link href="/uploads" className="btn primary glow"><Upload size={14} /> Upload Meeting</Link>
          </header>

          <Suspense>{children}</Suspense>
        </div>
      </div>

      {/* Floating AskFred AI Launcher Bar */}
      <div className="ask" onClick={() => setAskOpen(true)}>
        <Sparkles size={16} color="#6c47ff" className="sparkle-anim" />
        <span>Ask about your meetings...</span>
        <span className="kb-shortcut">⌘K</span>
        <ArrowRight size={14} />
      </div>

      {/* AskFred AI Modal Drawer */}
      {askOpen && (
        <div className="overlay" onClick={() => setAskOpen(false)}>
          <div className="modal ask-modal" onClick={e => e.stopPropagation()}>
            <div className="ask-header">
              <div className="ask-title">
                <Sparkles size={18} color="#6c47ff" />
                <h3>Meeting assistant</h3>
              </div>
              <X size={16} className="close-btn" onClick={() => setAskOpen(false)} />
            </div>

            <div className="ask-body">
              {!chatHistory.length && <p className="muted">Ask about your meeting transcripts. Configure OPENAI_API_KEY on the backend to enable AI answers.</p>}
              {chatHistory.map((c, i) => (
                <div key={i} className={`chat-msg ${c.role}`}>
                  <div className="chat-avatar">{c.role === "ai" ? "🤖" : "👤"}</div>
                  <div className="chat-content">
                    <p style={{ whiteSpace: "pre-wrap" }}>{c.text}</p>
                    {c.sources && c.sources.length > 0 && (
                      <div className="chat-sources">
                        <small>Relevant References:</small>
                        {c.sources.map((s, idx) => (
                          <div 
                            key={idx} 
                            className="source-chip"
                            onClick={() => {
                              setAskOpen(false);
                              router.push(`/meetings/${s.meeting_id}?t=${s.start_sec}`);
                            }}
                          >
                            📍 {s.title} ({s.speaker} @ {fmtT(s.start_sec)})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="chat-msg ai">
                  <div className="chat-avatar">🤖</div>
                  <div className="chat-content loading-dots">AskFred is analyzing transcripts...</div>
                </div>
              )}
            </div>

            <div className="ask-footer">
              <input 
                placeholder="Ask a question about any meeting..." 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAskSubmit(); }}
                autoFocus
              />
              <button className="btn primary" onClick={() => handleAskSubmit()} disabled={!chatInput.trim() || chatLoading}>
                <Send size={14} /> Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast Container */}
      <div className="toasts">
        {toasts.map(t => <div key={t.id}>{t.m}</div>)}
      </div>
    </div>
  );
}
