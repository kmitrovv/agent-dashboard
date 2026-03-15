"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { Agent, AgentType, AGENT_META, ImageAttachment, ContentBlock } from "@/lib/types";
import { AgentCard } from "@/components/AgentCard";
import { NewAgentModal } from "@/components/NewAgentModal";
import { ProjectSelector, addRecentProject } from "@/components/ProjectSelector";
import { AuthGate, AuthBadge } from "@/components/AuthGate";
import { SessionsDrawer } from "@/components/SessionsDrawer";
import { useAgentStream } from "@/lib/useAgentStream";
import { Plus, LayoutGrid, Columns, Cpu, Trash2, History, Zap, Paperclip, X as XIcon, CornerDownLeft } from "lucide-react";

let counter = 0;
type Layout = "grid" | "focus";

/** Convert raw SDK MessageParam[] into our ContentBlock[] for display */
function convertMessagesToBlocks(messages: unknown[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    // SDK may return {role, content} or {type:'user'|'assistant', message:{role,content}}
    const role = (m.role ?? (m.message as Record<string, unknown>)?.role) as string | undefined;
    const rawContent = m.content ?? (m.message as Record<string, unknown>)?.content ?? [];
    const parts: Array<Record<string, unknown>> =
      typeof rawContent === "string"
        ? [{ type: "text", text: rawContent }]
        : Array.isArray(rawContent)
        ? (rawContent as Array<Record<string, unknown>>)
        : [];

    for (const block of parts) {
      if (role === "assistant") {
        if (block.type === "text" && block.text) {
          blocks.push({ type: "text", content: String(block.text) });
        } else if (block.type === "tool_use") {
          blocks.push({
            type: "tool_use",
            content: "",
            toolName: block.name as string,
            toolInput: block.input as Record<string, unknown>,
          });
        }
      } else if (role === "user") {
        // Only show plain text user turns (not tool_result injections)
        if (block.type === "text" && block.text) {
          const text = String(block.text).trim();
          if (text) blocks.push({ type: "user_message", content: text });
        }
      }
    }
  }
  return blocks;
}

export default function App() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [layout, setLayout] = useState<Layout>("grid");
  const [project, setProject] = useState<string>("");

  useEffect(() => {
    const saved = localStorage.getItem("agent-dashboard:project");
    if (saved) setProject(saved);
  }, []);

  const handleProjectChange = useCallback((path: string) => {
    setProject(path);
    localStorage.setItem("agent-dashboard:project", path);
    addRecentProject(path);
  }, []);

  const updateAgent = useCallback((id: string, updater: (a: Agent) => Agent) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? updater(a) : a)));
  }, []);

  const { startStream, cancelStream } = useAgentStream(updateAgent, () => setShowAuthModal(true));

  const spawnAgent = useCallback(
    (type: AgentType, prompt: string, resumeSessionId?: string, images?: ImageAttachment[]) => {
      counter++;
      const id = `agent-${counter}-${Date.now()}`;
      const agent: Agent = {
        id,
        name: `${AGENT_META[type].label} #${counter}`,
        type,
        prompt,
        cwd: project || process.env.HOME || "/",
        status: "queued",
        blocks: [],
        startedAt: Date.now(),
        resumeSessionId,
        images,
      };
      setAgents((prev) => [...prev, agent]);
      setSelectedId(id);
      setTimeout(() => startStream(agent), 0);
    },
    [startStream, project]
  );

  const cancelAgent = useCallback(
    (id: string) => cancelStream(id),
    [cancelStream]
  );

  const continueAgent = useCallback(
    (id: string, prompt: string, images?: ImageAttachment[]) => {
      const agent = agents.find((a) => a.id === id);
      if (!agent) return;

      if (!agent.sessionId) {
        // Cancelled before session was initialised — restart fresh with new prompt
        const fresh: Agent = {
          ...agent,
          prompt,
          images,
          resumeSessionId: undefined,
          sessionId: undefined,
          status: "queued",
          endedAt: undefined,
          cost: undefined,
          error: undefined,
          startedAt: Date.now(),
          blocks: [{ type: "user_message" as const, content: prompt }],
        };
        setAgents((prev) => prev.map((a) => (a.id === id ? fresh : a)));
        setTimeout(() => startStream(fresh), 0);
        return;
      }

      // Normal resume — continue existing session
      const updated: Agent = {
        ...agent,
        prompt,
        images,
        resumeSessionId: agent.sessionId,
        sessionId: undefined,
        status: "queued",
        endedAt: undefined,
        cost: undefined,
        blocks: [
          ...agent.blocks,
          { type: "user_message" as const, content: prompt },
        ],
      };
      setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setTimeout(() => startStream(updated), 0);
    },
    [agents, startStream]
  );

  // Track in-flight resume fetches so we don't double-load
  const resumingRef = useRef<Set<string>>(new Set());

  const resumeSession = useCallback(
    async (session: { sessionId: string; agentType?: string; firstPrompt: string; cwd: string }) => {
      if (resumingRef.current.has(session.sessionId)) return;
      resumingRef.current.add(session.sessionId);
      setShowSessions(false);
      handleProjectChange(session.cwd);

      counter++;
      const id = `agent-${counter}-${Date.now()}`;
      const type: AgentType = (session.agentType as AgentType) ?? "thinker";

      // Add a loading placeholder immediately
      const placeholder: Agent = {
        id,
        name: `${AGENT_META[type].label} #${counter}`,
        type,
        prompt: session.firstPrompt,
        cwd: session.cwd,
        status: "queued",
        blocks: [],
        startedAt: Date.now(),
        sessionId: session.sessionId,
      };
      setAgents((prev) => [...prev, placeholder]);
      setSelectedId(id);

      // Fetch the real conversation history
      let blocks: ContentBlock[] = [];
      try {
        const resp = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.sessionId }),
        });
        const data = await resp.json();
        blocks = convertMessagesToBlocks(data.messages ?? []);
      } catch {}

      // Flip to "done" with history loaded — reply input will appear
      setAgents((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: "done", blocks, endedAt: Date.now() } : a
        )
      );
      resumingRef.current.delete(session.sessionId);
    },
    [handleProjectChange]
  );

  const removeAgent = useCallback((id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const runningCount = agents.filter((a) => a.status === "running").length;
  const doneCount = agents.filter((a) => a.status === "done").length;
  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-screen" style={{ background: "#08080f", color: "#e0e0ff" }}>
      {/* Header */}
      <header
        className="flex items-center gap-2.5 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid #1a1a30", background: "#0a0a14" }}
      >
        <div className="flex items-center gap-2 mr-1 flex-shrink-0">
          <Cpu size={15} style={{ color: "#6644ff" }} />
          <span className="font-bold text-sm" style={{ color: "#e0e0ff" }}>Agents</span>
        </div>

        <ProjectSelector value={project} onChange={handleProjectChange} />

        {/* Live stats */}
        <div className="flex items-center gap-3 text-xs font-mono" style={{ color: "#404068" }}>
          {runningCount > 0 && (
            <span className="flex items-center gap-1.5" style={{ color: "#00cc88" }}>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
                  style={{ animation: "ping 1.2s cubic-bezier(0,0,0.2,1) infinite" }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
              </span>
              {runningCount} running
            </span>
          )}
          {doneCount > 0 && <span style={{ color: "#4466aa" }}>{doneCount} done</span>}
        </div>

        <div className="flex-1" />

        <AuthBadge />

        {/* History */}
        <button
          onClick={() => setShowSessions(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
          style={{ color: "#606080", border: "1px solid #1e1e35" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#9977ff";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#6644ff40";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#606080";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e1e35";
          }}
        >
          <History size={13} />
          History
        </button>

        {/* Layout toggle */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #1e1e35" }}>
          {(["grid", "focus"] as Layout[]).map((l) => (
            <button key={l} onClick={() => setLayout(l)} className="p-1.5 transition-colors"
              style={{ background: layout === l ? "#1e1e35" : "transparent", color: layout === l ? "#c0c0e8" : "#404060" }}
            >
              {l === "grid" ? <LayoutGrid size={13} /> : <Columns size={13} />}
            </button>
          ))}
        </div>

        {agents.length > 0 && (
          <button
            onClick={() => { setAgents([]); setSelectedId(null); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
            style={{ color: "#505070", border: "1px solid #1e1e35" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#ff6688";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff446640";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#505070";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e1e35";
            }}
          >
            <Trash2 size={12} />
            Clear
          </button>
        )}

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: "linear-gradient(135deg, #5533ff, #8844ff)",
            color: "#fff",
            boxShadow: "0 0 14px rgba(85,51,255,0.35)",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 22px rgba(85,51,255,0.55)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 14px rgba(85,51,255,0.35)")}
        >
          <Plus size={14} />
          New Agent
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        {agents.length === 0 ? (
          <HomeInput
            onSubmit={(type, prompt, images) => spawnAgent(type, prompt, undefined, images)}
            onHistory={() => setShowSessions(true)}
            hasProject={!!project}
            project={project}
          />
        ) : layout === "grid" ? (
          <GridView
            agents={agents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRemove={removeAgent}
            onCancel={cancelAgent}
            onContinue={continueAgent}
          />
        ) : (
          <FocusView
            agents={agents}
            selectedId={selectedId}
            selectedAgent={selectedAgent}
            onSelect={setSelectedId}
            onRemove={removeAgent}
            onCancel={cancelAgent}
            onContinue={continueAgent}
          />
        )}
      </main>

      {showModal && (
        <NewAgentModal
          onSubmit={(type, prompt, images) => spawnAgent(type, prompt, undefined, images)}
          onClose={() => setShowModal(false)}
          hasProject={!!project}
          project={project}
        />
      )}

      <SessionsDrawer
        open={showSessions}
        onClose={() => setShowSessions(false)}
        currentProject={project}
        onResume={resumeSession}
      />
    </div>
  );
}

/* ─── Shared agent-card props ──────────────────────────────── */
interface CardCallbacks {
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onCancel: (id: string) => void;
  onContinue: (id: string, prompt: string, images?: ImageAttachment[]) => void;
}

/* ─── Grid View ─────────────────────────────────────────────── */
function GridView({ agents, selectedId, onSelect, onRemove, onCancel, onContinue }: {
  agents: Agent[]; selectedId: string | null;
} & CardCallbacks) {
  const cols = agents.length === 1 ? "grid-cols-1" : agents.length === 2 ? "grid-cols-2" :
    agents.length <= 4 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className={`grid ${cols} gap-3 p-3 h-full overflow-auto`}
      style={{ gridAutoRows: agents.length <= 2 ? "1fr" : "minmax(280px, 1fr)" }}>
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          isSelected={agent.id === selectedId}
          onClick={() => onSelect(agent.id)}
          onRemove={onRemove}
          onCancel={() => onCancel(agent.id)}
          onContinue={(prompt, images) => onContinue(agent.id, prompt, images)}
        />
      ))}
    </div>
  );
}

/* ─── Focus View ─────────────────────────────────────────────── */
function FocusView({ agents, selectedId, selectedAgent, onSelect, onRemove, onCancel, onContinue }: {
  agents: Agent[]; selectedId: string | null; selectedAgent: Agent | null;
} & CardCallbacks) {
  return (
    <div className="flex h-full">
      <div className="w-56 flex-shrink-0 overflow-y-auto p-2 space-y-1" style={{ borderRight: "1px solid #1a1a30" }}>
        {agents.map((agent) => {
          const meta = AGENT_META[agent.type];
          const selected = agent.id === selectedId;
          const statusColor = agent.status === "running" ? "#00ff88" : agent.status === "done" ? "#4488ff" :
            agent.status === "error" ? "#ff4466" : agent.status === "cancelled" ? "#806880" : "#404060";
          return (
            <button key={agent.id} onClick={() => onSelect(agent.id)}
              className="w-full text-left rounded-lg px-2.5 py-2 transition-all"
              style={{ background: selected ? `${meta.color}15` : "transparent", border: `1px solid ${selected ? meta.color + "35" : "transparent"}` }}
              onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = "#12121e"; }}
              onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm leading-none">{meta.emoji}</span>
                <span className="text-xs font-semibold" style={{ color: selected ? meta.color : "#8080b0" }}>{meta.label}</span>
                <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusColor }} />
              </div>
              <p className="text-xs truncate" style={{ color: "#404060" }}>{agent.prompt}</p>
            </button>
          );
        })}
      </div>
      <div className="flex-1 p-3 overflow-hidden">
        {selectedAgent ? (
          <AgentCard
            agent={selectedAgent}
            isSelected
            onClick={() => {}}
            onRemove={onRemove}
            onCancel={() => onCancel(selectedAgent.id)}
            onContinue={(prompt, images) => onContinue(selectedAgent.id, prompt, images)}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: "#25255a" }}>Select an agent</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Home Input (empty state) ───────────────────────────────── */
const HOME_VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type HomeValidMediaType = (typeof HOME_VALID_IMAGE_TYPES)[number];

function homeFileToAttachment(file: File): Promise<ImageAttachment | null> {
  if (!HOME_VALID_IMAGE_TYPES.includes(file.type as HomeValidMediaType)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      resolve({ data: dataUrl.split(",")[1], mediaType: file.type as HomeValidMediaType, name: file.name, previewUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  });
}

interface HomeSkillEntry { name: string; slug: string; description: string; source: "global" | "project" }
interface SkillPaths { projectCommands: string | null; projectSkills: string | null; global: string }

function HomeInput({ onSubmit, onHistory, hasProject, project }: {
  onSubmit: (type: AgentType, prompt: string, images?: ImageAttachment[]) => void;
  onHistory: () => void;
  hasProject: boolean;
  project: string;
}) {
  const [type, setType] = useState<AgentType>("thinker");
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [skills, setSkills] = useState<HomeSkillEntry[]>([]);
  const [skillPaths, setSkillPaths] = useState<SkillPaths | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => { textareaRef.current?.focus(); }, []);

  useEffect(() => {
    const url = project ? `/api/skills?cwd=${encodeURIComponent(project)}` : "/api/skills";
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setSkills(d.skills ?? []); setSkillPaths(d.paths ?? null); })
      .catch(() => {});
  }, [project]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const attachments = await Promise.all(arr.map(homeFileToAttachment));
    setImages((prev) => [...prev, ...(attachments.filter(Boolean) as ImageAttachment[])]);
  }, []);

  const handleSubmit = useCallback(() => {
    const p = prompt.trim();
    if (!p || !hasProject) return;
    onSubmit(type, p, images.length > 0 ? images : undefined);
    setPrompt("");
    setImages([]);
  }, [prompt, type, images, hasProject, onSubmit]);

  const insertSkill = (slug: string) => {
    const insertion = `/${slug}`;
    const textarea = textareaRef.current;
    if (textarea) {
      const pos = textarea.selectionStart ?? prompt.length;
      const before = prompt.slice(0, pos);
      const after = prompt.slice(pos);
      const sep = before && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
      setPrompt(before + sep + insertion + (after ? " " + after : ""));
      setTimeout(() => {
        const newPos = (before + sep + insertion).length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
      }, 0);
    } else {
      setPrompt((p) => p ? `${p} ${insertion}` : insertion);
    }
    textareaRef.current?.focus();
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const imageFiles = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file" && HOME_VALID_IMAGE_TYPES.includes(item.type as HomeValidMediaType))
      .map((item) => item.getAsFile()).filter(Boolean) as File[];
    if (imageFiles.length > 0) { e.preventDefault(); addFiles(imageFiles); }
  }, [addFiles]);

  const meta = AGENT_META[type];
  const canSubmit = !!prompt.trim() && hasProject;

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 overflow-y-auto"
      onPaste={handlePaste}
    >
      <div className="w-full max-w-2xl space-y-3">
        {/* Title */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <Cpu size={16} style={{ color: "#6644ff" }} />
            <span className="font-bold text-sm" style={{ color: "#c0c0e8" }}>
              {hasProject ? "What should an agent work on?" : "Set a project to get started"}
            </span>
          </div>
          {!hasProject && (
            <p className="text-xs" style={{ color: "#404068" }}>
              Pick a project folder in the header, then type your task below.
            </p>
          )}
        </div>

        {/* Main input box */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "#0e0e1a", border: `1px solid ${prompt ? "#3a3a6a" : "#1e1e35"}`, boxShadow: prompt ? "0 0 24px rgba(102,68,255,0.12)" : "none" }}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); }
            }}
            placeholder={hasProject ? "Describe what the agent should do… (⌘↵ to launch)" : "Set a project first…"}
            disabled={!hasProject}
            rows={4}
            className="w-full px-5 pt-4 pb-3 text-sm resize-none outline-none"
            style={{
              background: "transparent",
              color: "#c0c0e8",
              caretColor: meta.color,
              minHeight: "108px",
              overflow: "hidden",
              lineHeight: "1.6",
            }}
          />

          {/* Image previews */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {images.map((img, i) => (
                <div key={i} className="relative group" style={{ width: 52, height: 52 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.previewUrl} alt={img.name} className="w-full h-full object-cover rounded-lg"
                    style={{ border: "1px solid #2a2a48" }} />
                  <button onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "#ff4466", color: "#fff" }}>
                    <XIcon size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Bottom toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderTop: "1px solid #1a1a2e" }}>
            {/* Attach images */}
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
              style={{ background: "#13131f", border: "1px solid #1e1e35", color: "#50508a" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#9090cc"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#50508a"; }}
              title="Attach images (or Ctrl+V paste)"
            >
              <Paperclip size={11} />
              {images.length > 0 ? `${images.length} image${images.length > 1 ? "s" : ""}` : "Image"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)} />

            <div className="flex-1" />

            {/* History shortcut */}
            <button onClick={onHistory}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
              style={{ color: "#404060", border: "1px solid transparent" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#7766bb"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#404060"; }}
            >
              <History size={11} />
              History
            </button>

            {/* Submit */}
            <button onClick={handleSubmit} disabled={!canSubmit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: canSubmit ? meta.color : "#1e1e35",
                color: canSubmit ? "#000" : "#404060",
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              <CornerDownLeft size={11} />
              {meta.emoji} Launch {meta.label}
            </button>
          </div>
        </div>

        {/* Skills — always visible */}
        <div className="rounded-xl px-3 pt-2.5 pb-2" style={{ background: "#0a0a14", border: "1px solid #15152a" }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={10} style={{ color: "#6644ff" }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#404060" }}>Skills</span>
            {skills.length > 0 && (
              <span className="text-xs" style={{ color: "#30304a" }}>· click to insert into prompt</span>
            )}
          </div>
          {skills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <button key={`${skill.source}-${skill.slug}`} onClick={() => insertSkill(skill.slug)}
                  title={`${skill.description}\n\nInserts: /${skill.slug}`}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all"
                  style={{
                    background: skill.source === "project" ? "#6644ff15" : "#12121e",
                    border: `1px solid ${skill.source === "project" ? "#6644ff30" : "#1a1a2e"}`,
                    color: skill.source === "project" ? "#8866ee" : "#555577",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = skill.source === "project" ? "#6644ff22" : "#1a1a2e";
                    (e.currentTarget as HTMLButtonElement).style.color = skill.source === "project" ? "#aa88ff" : "#9090bb";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = skill.source === "project" ? "#6644ff15" : "#12121e";
                    (e.currentTarget as HTMLButtonElement).style.color = skill.source === "project" ? "#8866ee" : "#555577";
                  }}
                >
                  <span style={{ opacity: 0.5, fontSize: "9px" }}>/</span>
                  {skill.name}
                  {skill.source === "project" && (
                    <span style={{ color: "#6644ff60", fontSize: "9px", marginLeft: 2 }}>proj</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs space-y-0.5" style={{ color: "#35355a" }}>
              <p>No skills found. Add <code style={{ color: "#6644ff88" }}>.md</code> files to:</p>
              {skillPaths?.projectSkills && (
                <p><span style={{ color: "#2a2a50" }}>Project: </span>
                  <code style={{ color: "#6644ff70", wordBreak: "break-all" }}>{skillPaths.projectSkills}/</code></p>
              )}
              {skillPaths?.projectCommands && (
                <p><span style={{ color: "#2a2a50" }}>Project (commands): </span>
                  <code style={{ color: "#6644ff70", wordBreak: "break-all" }}>{skillPaths.projectCommands}/</code></p>
              )}
              <p><span style={{ color: "#2a2a50" }}>Global: </span>
                <code style={{ color: "#6644ff70" }}>{skillPaths?.global ?? "~/.claude/commands/"}</code></p>
            </div>
          )}
        </div>

        {/* Agent type pills */}
        <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
          <span className="text-xs" style={{ color: "#25254a" }}>Type:</span>
          {(Object.keys(AGENT_META) as AgentType[]).map((t) => {
            const m = AGENT_META[t];
            const sel = t === type;
            return (
              <button key={t} onClick={() => setType(t)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
                style={{
                  background: sel ? `${m.color}18` : "transparent",
                  border: `1px solid ${sel ? m.color + "55" : "#18182e"}`,
                  color: sel ? m.color : "#383858",
                }}
                onMouseEnter={(e) => { if (!sel) (e.currentTarget as HTMLButtonElement).style.color = "#555580"; }}
                onMouseLeave={(e) => { if (!sel) (e.currentTarget as HTMLButtonElement).style.color = "#383858"; }}
              >
                <span>{m.emoji}</span>
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
