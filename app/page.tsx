"use client";
import { useState, useCallback, useEffect } from "react";
import { Agent, AgentType, AGENT_META, ImageAttachment } from "@/lib/types";
import { AgentCard } from "@/components/AgentCard";
import { NewAgentModal } from "@/components/NewAgentModal";
import { ProjectSelector, addRecentProject } from "@/components/ProjectSelector";
import { AuthGate, AuthBadge } from "@/components/AuthGate";
import { SessionsDrawer } from "@/components/SessionsDrawer";
import { useAgentStream } from "@/lib/useAgentStream";
import { Plus, LayoutGrid, Columns, Cpu, Trash2, History } from "lucide-react";

let counter = 0;
type Layout = "grid" | "focus";

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
      if (!agent?.sessionId) return;
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

  const resumeSession = useCallback(
    (session: { sessionId: string; agentType?: string; firstPrompt: string; cwd: string }) => {
      setShowSessions(false);
      handleProjectChange(session.cwd);
      spawnAgent(
        (session.agentType as AgentType) ?? "thinker",
        session.firstPrompt || "Continue from where we left off.",
        session.sessionId
      );
    },
    [spawnAgent, handleProjectChange]
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
          <EmptyState onNew={() => setShowModal(true)} onHistory={() => setShowSessions(true)} hasProject={!!project} />
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

/* ─── Empty State ─────────────────────────────────────────────── */
function EmptyState({ onNew, onHistory, hasProject }: { onNew: () => void; onHistory: () => void; hasProject: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 p-8">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "#0e0e20", border: "1px solid #2a2a48" }}>
        <Cpu size={26} style={{ color: "#5533ff" }} />
      </div>
      <div className="text-center max-w-xs">
        <h2 className="text-base font-bold mb-1.5" style={{ color: "#c0c0e8" }}>
          {hasProject ? "Ready to launch" : "Set a project first"}
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "#404068" }}>
          {hasProject
            ? "Spawn agents in parallel. Each one reads files, runs code, and works directly in your project."
            : "Pick a project folder above, then launch agents that work inside it."}
        </p>
      </div>
      {hasProject && (
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(AGENT_META) as AgentType[]).map((type) => {
            const meta = AGENT_META[type];
            return (
              <div key={type} className="flex flex-col items-center gap-1 p-2.5 rounded-xl"
                style={{ background: "#0e0e1a", border: "1px solid #1e1e35" }}>
                <span className="text-lg">{meta.emoji}</span>
                <span className="text-xs font-medium" style={{ color: meta.color }}>{meta.label}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onNew} disabled={!hasProject}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm"
          style={{
            background: hasProject ? "linear-gradient(135deg, #5533ff, #8844ff)" : "#13131f",
            color: hasProject ? "#fff" : "#404060",
            boxShadow: hasProject ? "0 0 18px rgba(85,51,255,0.4)" : "none",
            border: hasProject ? "none" : "1px solid #1e1e35",
            cursor: hasProject ? "pointer" : "not-allowed",
          }}>
          <Plus size={14} />
          New Agent
        </button>
        <button onClick={onHistory}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-colors"
          style={{ background: "#0e0e1a", border: "1px solid #1e1e35", color: "#606080" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#9977ff";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#6644ff40";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#606080";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e1e35";
          }}>
          <History size={14} />
          View History
        </button>
      </div>
    </div>
  );
}
