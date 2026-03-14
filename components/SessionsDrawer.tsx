"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { X, Search, Clock, FolderOpen, Play, RefreshCw, ChevronRight, DollarSign, Zap } from "lucide-react";
import { AgentType, AGENT_META } from "@/lib/types";

interface SessionSummary {
  sessionId: string;
  cwd: string;
  firstPrompt: string;
  summary: string;
  lastModified: number;
  createdAt: number;
  fileSize: number;
  agentType?: string;
  costUsd?: number;
  status?: string;
}

interface SessionMessage {
  type: "user" | "assistant";
  uuid: string;
  session_id: string;
  message: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentProject: string;
  onResume: (session: SessionSummary) => void;
}

function ago(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}

function MessageView({ msg }: { msg: SessionMessage }) {
  const isUser = msg.type === "user" || msg.message?.role === "user";
  const content = msg.message?.content;

  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
  }

  if (!text.trim()) return null;

  return (
    <div className={`text-xs ${isUser ? "mb-3" : "mb-4"}`}>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-1"
        style={{ color: isUser ? "#6644ff" : "#22c55e" }}
      >
        {isUser ? "You" : "Agent"}
      </div>
      <div
        className="whitespace-pre-wrap break-words leading-relaxed"
        style={{ color: isUser ? "#a0a0cc" : "#c0c0e8" }}
      >
        {text.length > 800 ? text.slice(0, 800) + "…" : text}
      </div>
    </div>
  );
}

export function SessionsDrawer({ open, onClose, currentProject, onResume }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filterProject, setFilterProject] = useState(true);
  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "80" });
      if (filterProject && currentProject) params.set("project", currentProject);
      if (q) params.set("q", q);
      const res = await fetch(`/api/sessions?${params}`);
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [q, filterProject, currentProject]);

  useEffect(() => {
    if (open) {
      load();
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open, load]);

  // Debounce search
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [q, filterProject, open, load]);

  const loadMessages = async (session: SessionSummary) => {
    setSelected(session);
    setMessagesLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  if (!open) return null;

  const agentMeta = selected?.agentType
    ? AGENT_META[selected.agentType as AgentType]
    : null;

  return (
    <div
      className="fixed inset-0 z-40 flex"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="ml-auto flex h-full agent-enter"
        style={{ width: selected ? 780 : 400 }}
      >
        {/* Sessions list */}
        <div
          className="flex flex-col h-full"
          style={{
            width: 400,
            background: "#0a0a14",
            borderLeft: "1px solid #1e1e35",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid #1e1e35" }}
          >
            <Clock size={14} style={{ color: "#6644ff" }} />
            <span className="font-semibold text-sm" style={{ color: "#e0e0ff" }}>
              Session History
            </span>
            <span className="text-xs font-mono ml-1" style={{ color: "#404060" }}>
              {sessions.length}
            </span>
            <div className="flex-1" />
            <button
              onClick={load}
              className="p-1 rounded hover:bg-white/5 transition-colors"
              style={{ color: "#404060" }}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/5 transition-colors"
              style={{ color: "#404060" }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Search + filter */}
          <div className="p-3 space-y-2 flex-shrink-0" style={{ borderBottom: "1px solid #141425" }}>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#404060" }} />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search sessions…"
                className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs outline-none"
                style={{
                  background: "#08080f",
                  border: "1px solid #1e1e35",
                  color: "#c0c0e8",
                  caretColor: "#6644ff",
                }}
              />
            </div>
            {currentProject && (
              <button
                onClick={() => setFilterProject((f) => !f)}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors"
                style={{
                  background: filterProject ? "#6644ff20" : "transparent",
                  border: `1px solid ${filterProject ? "#6644ff40" : "#1e1e35"}`,
                  color: filterProject ? "#9977ff" : "#404060",
                }}
              >
                <FolderOpen size={11} />
                {currentProject.split("/").pop()}
                {filterProject ? " only" : " (all)"}
              </button>
            )}
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto">
            {loading && sessions.length === 0 ? (
              <div className="p-4 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="loading-shimmer h-14 rounded-lg" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <Clock size={20} style={{ color: "#202040" }} />
                <p className="text-xs" style={{ color: "#303058" }}>
                  {q ? "No matching sessions" : "No sessions yet"}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {sessions.map((s) => {
                  const aMeta = s.agentType ? AGENT_META[s.agentType as AgentType] : null;
                  const isSelected = selected?.sessionId === s.sessionId;

                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => loadMessages(s)}
                      className="w-full text-left rounded-lg px-3 py-2.5 transition-all group"
                      style={{
                        background: isSelected ? "#1a1a30" : "transparent",
                        border: `1px solid ${isSelected ? "#2a2a50" : "transparent"}`,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "#0e0e1a";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5 flex-shrink-0">
                          {aMeta?.emoji ?? "💬"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-xs font-medium truncate"
                            style={{ color: isSelected ? "#c0c0e8" : "#8080b0" }}
                          >
                            {s.firstPrompt || s.summary || "Untitled session"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs" style={{ color: "#35355a" }}>
                              {ago(s.lastModified)}
                            </span>
                            <span className="text-xs" style={{ color: "#252545" }}>
                              {formatBytes(s.fileSize)}
                            </span>
                            {s.costUsd != null && (
                              <span className="flex items-center gap-0.5 text-xs" style={{ color: "#35355a" }}>
                                <DollarSign size={9} />
                                {s.costUsd.toFixed(4)}
                              </span>
                            )}
                            {aMeta && (
                              <span className="text-xs font-medium" style={{ color: aMeta.color + "99" }}>
                                {aMeta.label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <FolderOpen size={9} style={{ color: "#252545" }} />
                            <span className="text-xs truncate" style={{ color: "#252545" }}>
                              {s.cwd.split("/").slice(-2).join("/")}
                            </span>
                          </div>
                        </div>
                        <ChevronRight
                          size={12}
                          className="flex-shrink-0 mt-1 transition-opacity opacity-0 group-hover:opacity-100"
                          style={{ color: "#404060" }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Session detail panel */}
        {selected && (
          <div
            className="flex flex-col h-full flex-1 agent-enter"
            style={{ background: "#0e0e1a", borderLeft: "1px solid #1e1e35" }}
          >
            {/* Detail header */}
            <div
              className="flex items-start gap-3 px-4 py-3 flex-shrink-0"
              style={{ borderBottom: "1px solid #1e1e35" }}
            >
              <span className="text-xl leading-none mt-0.5">{agentMeta?.emoji ?? "💬"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug" style={{ color: "#c0c0e8" }}>
                  {selected.firstPrompt || selected.summary || "Session"}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {agentMeta && (
                    <span className="text-xs font-semibold" style={{ color: agentMeta.color }}>
                      {agentMeta.label}
                    </span>
                  )}
                  <span className="text-xs font-mono" style={{ color: "#35355a" }}>
                    {new Date(selected.createdAt).toLocaleString()}
                  </span>
                  <span className="text-xs font-mono" style={{ color: "#252545" }}>
                    {selected.sessionId.slice(0, 8)}…
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <FolderOpen size={10} style={{ color: "#252545" }} />
                  <span className="text-xs font-mono truncate" style={{ color: "#35355a" }}>
                    {selected.cwd}
                  </span>
                </div>
              </div>
              <button
                onClick={() => onResume(selected)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all"
                style={{
                  background: "linear-gradient(135deg, #5533ff, #8844ff)",
                  color: "#fff",
                  boxShadow: "0 0 12px rgba(85,51,255,0.3)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 20px rgba(85,51,255,0.5)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px rgba(85,51,255,0.3)";
                }}
              >
                <Play size={11} />
                Resume
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {messagesLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="loading-shimmer rounded h-16" />
                  ))}
                </div>
              ) : (
                <div className="terminal text-xs space-y-1">
                  {messages
                    .filter((m) => m.type === "user" || m.type === "assistant")
                    .slice(0, 60)
                    .map((msg, i) => (
                      <MessageView key={i} msg={msg} />
                    ))}
                  {messages.length === 0 && (
                    <p className="text-xs" style={{ color: "#303058" }}>
                      No messages found
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
