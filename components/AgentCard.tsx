"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Agent, AGENT_META, ContentBlock, ImageAttachment } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { X, ChevronDown, ChevronUp, Clock, DollarSign, FolderOpen, Square, Zap, CornerDownLeft, Paperclip } from "lucide-react";

const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ValidMediaType = (typeof VALID_IMAGE_TYPES)[number];

async function fileToAttachment(file: File): Promise<ImageAttachment | null> {
  if (!VALID_IMAGE_TYPES.includes(file.type as ValidMediaType)) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      resolve({ data: dataUrl.split(",")[1], mediaType: file.type as ValidMediaType, name: file.name, previewUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  });
}

interface SkillEntry {
  name: string;
  slug: string;
  description: string;
  source: "global" | "project";
}

interface Props {
  agent: Agent;
  onRemove: (id: string) => void;
  onCancel?: () => void;
  onContinue?: (prompt: string, images?: ImageAttachment[]) => void;
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
  const name = block.toolName ?? "Tool";
  const info = TOOL_LABELS[name] ?? { label: name, icon: "🔧", color: "#606090" };

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
  if (block.type === "tool_result") return null;
  if (block.type === "text") {
    return (
      <div className="text-xs whitespace-pre-wrap break-words" style={{ color: "#c0c0e8" }}>
        {block.content}
      </div>
    );
  }
  if (block.type === "user_message") {
    return (
      <div className="flex justify-end mt-1 mb-1">
        <div
          className="text-xs px-3 py-1.5 rounded-2xl rounded-br-sm max-w-[85%] whitespace-pre-wrap break-words"
          style={{ background: "#1e1e38", border: "1px solid #2e2e50", color: "#a0a0d0" }}
        >
          {block.content}
        </div>
      </div>
    );
  }
  return null;
}

/* ── Reply input shown at the bottom of a completed agent card ── */
function ReplyInput({
  onSubmit,
  cwd,
  agentColor,
}: {
  onSubmit: (prompt: string, images?: ImageAttachment[]) => void;
  cwd: string;
  agentColor: string;
}) {
  const [value, setValue] = useState("");
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [skillsProjectDir, setSkillsProjectDir] = useState<string | null>(null);
  const [showSkills, setShowSkills] = useState(false);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = cwd ? `/api/skills?cwd=${encodeURIComponent(cwd)}` : "/api/skills";
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setSkills(d.skills ?? []); setSkillsProjectDir(d.paths?.projectSkills ?? d.paths?.projectCommands ?? null); })
      .catch(() => {});
  }, [cwd]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const attachments = await Promise.all(arr.map(fileToAttachment));
    setImages((prev) => [...prev, ...(attachments.filter(Boolean) as ImageAttachment[])]);
  }, []);

  const handleSubmit = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    const p = value.trim();
    if (!p) return;
    onSubmit(p, images.length > 0 ? images : undefined);
    setValue("");
    setImages([]);
    setShowSkills(false);
  };

  const insertSkill = (slug: string) => {
    const insertion = `/${slug}`;
    const textarea = textareaRef.current;
    if (textarea) {
      const pos = textarea.selectionStart ?? value.length;
      const before = value.slice(0, pos);
      const after = value.slice(pos);
      const sep = before && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
      const newVal = before + sep + insertion + (after ? " " + after : "");
      setValue(newVal);
      setShowSkills(false);
      setTimeout(() => {
        const newPos = (before + sep + insertion).length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
      }, 0);
    } else {
      setValue((v) => (v ? `${v} ${insertion}` : insertion));
      setShowSkills(false);
    }
  };

  // Paste images anywhere inside the reply area (not just when textarea focused)
  const handleContainerPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const imageFiles = Array.from(e.clipboardData.items)
        .filter((item) => item.kind === "file" && VALID_IMAGE_TYPES.includes(item.type as ValidMediaType))
        .map((item) => item.getAsFile())
        .filter(Boolean) as File[];
      if (imageFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        addFiles(imageFiles);
      }
      // Text paste: let it bubble naturally to the focused textarea
    },
    [addFiles]
  );

  return (
    <div
      onClick={(e) => { e.stopPropagation(); textareaRef.current?.focus(); }}
      onPaste={handleContainerPaste}
      style={{ borderTop: "1px solid #1a1a2e", background: "#09090f", padding: "8px 10px" }}
    >
      {/* Skills chips panel */}
      {showSkills && (
        <div
          className="mb-2 pb-2"
          style={{ borderBottom: "1px solid #14142a" }}
        >
          {skills.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {skills.map((s) => (
                <button
                  key={`${s.source}-${s.slug}`}
                  onClick={() => insertSkill(s.slug)}
                  title={s.description}
                  className="text-xs px-2 py-0.5 rounded-md transition-colors"
                  style={{
                    background: s.source === "project" ? "#6644ff15" : "#13131f",
                    border: `1px solid ${s.source === "project" ? "#6644ff35" : "#1e1e35"}`,
                    color: s.source === "project" ? "#9977ff" : "#60608a",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      s.source === "project" ? "#bb99ff" : "#a0a0cc";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      s.source === "project" ? "#9977ff" : "#60608a";
                  }}
                >
                  <span style={{ opacity: 0.55, marginRight: 1 }}>/</span>
                  {s.name}
                  {s.source === "project" && (
                    <span style={{ color: "#6644ff70", fontSize: 9, marginLeft: 3 }}>proj</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs leading-relaxed space-y-1" style={{ color: "#40406a" }}>
              <p>No skills found. Add <code style={{ color: "#6644ffaa" }}>.md</code> files to:</p>
              <p><span style={{ color: "#35355a" }}>Global: </span><code style={{ color: "#6644ff88" }}>~/.claude/commands/</code></p>
              {skillsProjectDir && (
                <p><span style={{ color: "#35355a" }}>Project skills: </span><code style={{ color: "#6644ff88", wordBreak: "break-all" }}>{skillsProjectDir}</code></p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {/* Skills toggle — always visible */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowSkills((s) => !s); }}
          title={skills.length > 0 ? "Show available skills" : "No skills yet — click to learn how to add them"}
          className="flex items-center gap-1 flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: showSkills ? "#6644ff20" : "#0e0e1a",
            border: `1px solid ${showSkills ? "#6644ff50" : "#2a2a45"}`,
            color: showSkills ? "#9977ff" : skills.length > 0 ? "#6060a0" : "#35354a",
          }}
          onMouseEnter={(e) => {
            if (!showSkills) {
              (e.currentTarget as HTMLButtonElement).style.color = "#9977ff";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#6644ff40";
              (e.currentTarget as HTMLButtonElement).style.background = "#6644ff10";
            }
          }}
          onMouseLeave={(e) => {
            if (!showSkills) {
              (e.currentTarget as HTMLButtonElement).style.color = skills.length > 0 ? "#6060a0" : "#35354a";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a2a45";
              (e.currentTarget as HTMLButtonElement).style.background = "#0e0e1a";
            }
          }}
        >
          <Zap size={10} />
          <span>Skills</span>
          {skills.length > 0 && <span style={{ fontSize: 9, opacity: 0.6 }}>({skills.length})</span>}
        </button>

        {/* Attach images button */}
        <button
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          title="Attach images"
          className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
          style={{ background: images.length > 0 ? "#4466ff20" : "transparent", border: `1px solid ${images.length > 0 ? "#4466ff40" : "#1e1e35"}`, color: images.length > 0 ? "#6688ff" : "#35355a" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#8899ff"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = images.length > 0 ? "#6688ff" : "#35355a"; }}
        >
          <Paperclip size={12} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />

        {/* Prompt textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder="Follow up… (↵ to send, paste images)"
          rows={1}
          className="flex-1 rounded-lg px-2.5 py-1.5 text-xs resize-none outline-none"
          style={{
            background: "#07070e",
            border: `1px solid ${value || images.length > 0 ? agentColor + "45" : "#1a1a2e"}`,
            color: "#c0c0e8",
            caretColor: agentColor,
            lineHeight: "1.5",
            minHeight: "30px",
            maxHeight: "160px",
            overflow: "auto",
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="flex items-center justify-center flex-shrink-0 w-7 h-7 rounded-lg transition-all"
          title="Send (↵)"
          style={{
            background: value.trim() ? agentColor : "#1a1a2e",
            color: value.trim() ? "#000" : "#303050",
            cursor: value.trim() ? "pointer" : "not-allowed",
          }}
        >
          <CornerDownLeft size={12} />
        </button>
      </div>

      {/* Image thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {images.map((img, i) => (
            <div key={i} className="relative group" style={{ width: 44, height: 44 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.previewUrl} alt={img.name} className="w-full h-full object-cover rounded-md" style={{ border: "1px solid #2a2a48" }} />
              <button
                onClick={(e) => { e.stopPropagation(); setImages((prev) => prev.filter((_, j) => j !== i)); }}
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "#ff4466", color: "#fff" }}
              >
                <X size={8} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main AgentCard ─────────────────────────────────────────── */
export function AgentCard({ agent, onRemove, onCancel, onContinue, isSelected, onClick }: Props) {
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
  const isRunning = agent.status === "running";
  const isDone = agent.status === "done";

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

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ElapsedTimer startedAt={agent.startedAt} endedAt={agent.endedAt} />
          {agent.cost != null && (
            <span className="flex items-center gap-0.5 text-xs font-mono" style={{ color: "#404060" }}>
              <DollarSign size={9} />
              {agent.cost.toFixed(4)}
            </span>
          )}

          {/* Cancel button — only while running */}
          {isRunning && onCancel && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              title="Cancel"
              className="p-0.5 rounded transition-colors"
              style={{ color: "#604060" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#ff6688";
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,68,136,0.12)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#604060";
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <Square size={13} />
            </button>
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

          {agent.status === "cancelled" && !agent.error && (
            <div
              className="text-xs px-3 py-2 rounded leading-relaxed"
              style={{ color: "#907090", background: "#80408015", border: "1px solid #80408030" }}
            >
              ◼ Cancelled
            </div>
          )}

          {visibleBlocks.map((block, i) => (
            <BlockView key={i} block={block} />
          ))}

          {/* Live activity indicator */}
          {isRunning && (
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

      {/* Footer: stats when done */}
      {isDone && !collapsed && (
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

      {/* Reply input — shown when done and not collapsed */}
      {isDone && !collapsed && onContinue && (
        <ReplyInput
          onSubmit={onContinue}
          cwd={agent.cwd}
          agentColor={meta.color}
        />
      )}
    </div>
  );
}
