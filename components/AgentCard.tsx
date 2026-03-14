"use client";
import { useEffect, useRef, useState } from "react";
import { Agent, AGENT_META, ContentBlock } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { X, ChevronDown, ChevronUp, Clock, DollarSign, FolderOpen } from "lucide-react";

interface Props {
  agent: Agent;
  onRemove: (id: string) => void;
  isSelected: boolean;
  onClick: () => void;
}

function ElapsedTimer({ startedAt, endedAt }: { startedAt: number; endedAt?: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (endedAt) { setElapsed(endedAt - startedAt); return; }
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 200);
    return () => clearInterval(id);
  }, [startedAt, endedAt]);
  return (
    <span className="flex items-center gap-1 text-xs font-mono" style={{ color: "#504880" }}>
      <Clock size={10} />
      {(elapsed / 1000).toFixed(1)}s
    </span>
  );
}

const TOOL_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  Read: { label: "Reading", icon: "📄", color: "#4466cc" },
  Edit: { label: "Editing", icon: "✏️", color: "#22c55e" },
  Write: { label: "Writing", icon: "📝", color: "#22c55e" },
  Bash: { label: "Running", icon: "⚡", color: "#eab308" },
  Glob: { label: "Scanning", icon: "🔎", color: "#4488ff" },
  Grep: { label: "Searching", icon: "🔍", color: "#4488ff" },
  WebSearch: { label: "Searching web", icon: "🌐", color: "#a855f7" },
  WebFetch: { label: "Fetching", icon: "🌐", color: "#a855f7" },
  AskUserQuestion: { label: "Asking", icon: "💬", color: "#ff8844" },
};

function ToolBlock({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false);
  const name = block.toolName ?? "Tool";
  const info = TOOL_LABELS[name] ?? { label: name, icon: "🔧", color: "#606090" };

  // Extract the most useful display value from input
  let displayValue = "";
  const input = block.toolInput ?? {};
  if (input.file_path) displayValue = String(input.file_path).split("/").slice(-2).join("/");
  else if (input.command) displayValue = String(input.command).slice(0, 60);
  else if (input.pattern) displayValue = String(input.pattern).slice(0, 60);
  else if (input.query) displayValue = String(input.query).slice(0, 60);
  else if (input.path) displayValue = String(input.path).split("/").slice(-2).join("/");

  return (
    <div
      className="flex items-center gap-2 text-xs font-mono px-2 py-1 rounded-md"
      style={{ background: `${info.color}10`, border: `1px solid ${info.color}25` }}
    >
      <span>{info.icon}</span>
      <span style={{ color: info.color }}>{info.label}</span>
      {displayValue && (
        <span className="truncate max-w-[200px]" style={{ color: "#60609a" }}>
          {displayValue}
        </span>
      )}
    </div>
  );
}

function BlockView({ block }: { block: ContentBlock }) {
  if (block.type === "tool_use") return <ToolBlock block={block} />;

  if (block.type === "tool_result") return null; // hide raw results, too noisy

  if (block.type === "text") {
    return (
      <div className="text-xs whitespace-pre-wrap break-words" style={{ color: "#c0c0e8" }}>
        {block.content}
      </div>
    );
  }

  return null;
}

export function AgentCard({ agent, onRemove, isSelected, onClick }: Props) {
  const meta = AGENT_META[agent.type];
  const termRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (termRef.current && !collapsed) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [agent.blocks, collapsed]);

  const lastTool = [...agent.blocks].reverse().find((b) => b.type === "tool_use");
  const visibleBlocks = agent.blocks.filter(
    (b) => b.type === "text" || b.type === "tool_use"
  );
  const dirName = agent.cwd.split("/").filter(Boolean).pop() ?? agent.cwd;

  return (
    <div
      className="agent-enter rounded-xl overflow-hidden flex flex-col h-full"
      style={{
        background: "#0e0e1a",
        border: `1px solid ${isSelected ? meta.color + "55" : "#1e1e35"}`,
        boxShadow: isSelected ? `0 0 0 1px ${meta.color}25, 0 4px 24px ${meta.color}10` : "none",
        transition: "border-color 0.2s, box-shadow 0.2s",
        cursor: "pointer",
        minHeight: 280,
      }}
      onClick={onClick}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
        style={{
          background: `linear-gradient(to right, ${meta.color}12, transparent)`,
          borderBottom: `1px solid ${meta.color}20`,
        }}
      >
        <span className="text-base leading-none">{meta.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: meta.color }}>
              {meta.label}
            </span>
            <StatusBadge status={agent.status} />
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: "#45456a" }}>
            {agent.prompt}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <ElapsedTimer startedAt={agent.startedAt} endedAt={agent.endedAt} />
          {agent.cost != null && (
            <span className="flex items-center gap-0.5 text-xs font-mono" style={{ color: "#404060" }}>
              <DollarSign size={9} />
              {agent.cost.toFixed(4)}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
            className="p-0.5 rounded hover:bg-white/5 transition-colors"
            style={{ color: "#404060" }}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(agent.id); }}
            className="p-0.5 rounded hover:bg-red-500/20 transition-colors"
            style={{ color: "#404060" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#ff6688")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#404060")}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Project label */}
      <div
        className="flex items-center gap-1.5 px-3 py-1 flex-shrink-0"
        style={{ borderBottom: "1px solid #141425" }}
      >
        <FolderOpen size={10} style={{ color: "#35355a" }} />
        <span className="text-xs font-mono truncate" style={{ color: "#35355a" }}>
          {dirName}
        </span>
      </div>

      {/* Terminal output */}
      {!collapsed && (
        <div
          ref={termRef}
          className="terminal flex-1 overflow-y-auto p-3 space-y-2"
          style={{ minHeight: 180 }}
        >
          {agent.status === "queued" && (
            <div className="space-y-1.5">
              <div className="loading-shimmer h-2.5 rounded w-3/4" />
              <div className="loading-shimmer h-2.5 rounded w-1/2" />
            </div>
          )}

          {agent.error && (
            <div
              className="text-xs px-3 py-2 rounded leading-relaxed"
              style={{ color: "#ff8899", background: "#ff223315", border: "1px solid #ff223330" }}
            >
              ⚠ {agent.error}
            </div>
          )}

          {visibleBlocks.map((block, i) => (
            <BlockView key={i} block={block} />
          ))}

          {/* Live activity indicator */}
          {agent.status === "running" && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "#333360" }}>
              {lastTool ? (
                <>
                  <span className="inline-block w-1 h-1 rounded-full animate-pulse" style={{ background: "#5555a0" }} />
                  <span className="font-mono">
                    {TOOL_LABELS[lastTool.toolName ?? ""]?.label ?? lastTool.toolName}…
                  </span>
                </>
              ) : visibleBlocks.length === 0 ? (
                <>
                  <span className="inline-block w-1 h-1 rounded-full animate-pulse" style={{ background: "#5555a0" }} />
                  <span className="font-mono">initializing…</span>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {agent.status === "done" && !collapsed && (
        <div
          className="px-3 py-1.5 flex items-center gap-3 text-xs font-mono flex-shrink-0"
          style={{ borderTop: "1px solid #141425", color: "#35355a" }}
        >
          <span>
            {agent.blocks.filter((b) => b.type === "tool_use").length} tool calls
          </span>
          <span>·</span>
          <span>
            {agent.blocks
              .filter((b) => b.type === "text")
              .reduce((n, b) => n + b.content.length, 0)}{" "}
            chars
          </span>
        </div>
      )}
    </div>
  );
}
