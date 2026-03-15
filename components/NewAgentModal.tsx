"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { AgentType, AGENT_META, ImageAttachment } from "@/lib/types";
import { X, Sparkles, Zap, Paperclip } from "lucide-react";

const EXAMPLE_PROMPTS: Record<AgentType, string[]> = {
  researcher: [
    "Give me an overview of this codebase — architecture, key modules, and how they connect",
    "What are the main dependencies and how are they used?",
    "Find all the places where authentication/authorization is handled",
  ],
  coder: [
    "Find and fix any TODO or FIXME comments in the codebase",
    "Add proper error handling to all async functions that are missing it",
    "Refactor the largest/most complex file to be cleaner and better organized",
  ],
  analyst: [
    "Audit this codebase for potential security issues or vulnerabilities",
    "Find all N+1 query patterns or performance bottlenecks",
    "Analyze test coverage — what's missing and what's most critical to add?",
  ],
  writer: [
    "Write a comprehensive README for this project",
    "Document all public functions and classes that are missing docstrings",
    "Create a CONTRIBUTING guide based on the code style and patterns you see",
  ],
  thinker: [
    "What are the biggest architectural risks or tech debt in this codebase?",
    "How would you redesign this project if starting from scratch today?",
    "What are the most fragile or risky parts of this system?",
  ],
  planner: [
    "Create a step-by-step plan to add comprehensive test coverage to this project",
    "Plan a migration from the current stack to a modern alternative",
    "Design a roadmap for making this codebase production-ready",
  ],
};

const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ValidMediaType = (typeof VALID_IMAGE_TYPES)[number];

interface SkillEntry {
  name: string;
  slug: string;
  description: string;
  source: "global" | "project";
}

interface Props {
  onSubmit: (type: AgentType, prompt: string, images?: ImageAttachment[]) => void;
  onClose: () => void;
  hasProject?: boolean;
  project?: string;
}

async function fileToAttachment(file: File): Promise<ImageAttachment | null> {
  if (!VALID_IMAGE_TYPES.includes(file.type as ValidMediaType)) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve({
        data: base64,
        mediaType: file.type as ValidMediaType,
        name: file.name,
        previewUrl: dataUrl,
      });
    };
    reader.readAsDataURL(file);
  });
}

export function NewAgentModal({ onSubmit, onClose, hasProject = false, project = "" }: Props) {
  const [type, setType] = useState<AgentType>("thinker");
  const [prompt, setPrompt] = useState("");
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [skillsProjectDir, setSkillsProjectDir] = useState<string | null>(null);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load skills
  useEffect(() => {
    const url = project ? `/api/skills?cwd=${encodeURIComponent(project)}` : "/api/skills";
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setSkills(d.skills ?? []); setSkillsProjectDir(d.paths?.projectSkills ?? d.paths?.projectCommands ?? null); })
      .catch(() => {});
  }, [project]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const attachments = await Promise.all(arr.map(fileToAttachment));
    setImages((prev) => [...prev, ...(attachments.filter(Boolean) as ImageAttachment[])]);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const imageFiles = Array.from(e.clipboardData.items)
        .filter((item) => item.kind === "file" && VALID_IMAGE_TYPES.includes(item.type as ValidMediaType))
        .map((item) => item.getAsFile())
        .filter(Boolean) as File[];
      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    },
    [addFiles]
  );

  const handleSubmit = () => {
    const p = prompt.trim();
    if (!p) return;
    onSubmit(type, p, images.length > 0 ? images : undefined);
    onClose();
  };

  const insertSkill = (slug: string) => {
    const insertion = `/${slug}`;
    const textarea = textareaRef.current;
    if (textarea) {
      const pos = textarea.selectionStart ?? prompt.length;
      const before = prompt.slice(0, pos);
      const after = prompt.slice(pos);
      const separator = before && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
      const newPrompt = before + separator + insertion + (after ? " " + after : "");
      setPrompt(newPrompt);
      setTimeout(() => {
        const newPos = (before + separator + insertion).length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
      }, 0);
    } else {
      setPrompt((p) => p ? `${p} ${insertion}` : insertion);
    }
  };

  const meta = AGENT_META[type];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden agent-enter"
        style={{ background: "#0e0e1a", border: "1px solid #2a2a48", maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1e1e35" }}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: meta.color }} />
            <span className="font-semibold text-sm" style={{ color: "#e0e0ff" }}>New Agent</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "#606090" }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Agent type selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#606090" }}>
              Agent Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(AGENT_META) as AgentType[]).map((t) => {
                const m = AGENT_META[t];
                const selected = t === type;
                return (
                  <button key={t} onClick={() => setType(t)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                    style={{
                      background: selected ? `${m.color}20` : "#13131f",
                      border: `1px solid ${selected ? m.color + "60" : "#1e1e35"}`,
                      color: selected ? m.color : "#808090",
                    }}
                  >
                    <span>{m.emoji}</span>
                    <span className="font-medium">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt input */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#606090" }}>
              Prompt
            </label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                // Auto-grow
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
              onPaste={handlePaste}
              placeholder="What should this agent work on? (paste images here)"
              rows={4}
              className="w-full rounded-lg px-3 py-2.5 text-sm resize-none outline-none transition-colors"
              style={{
                background: "#08080f",
                border: `1px solid ${prompt ? meta.color + "50" : "#1e1e35"}`,
                color: "#c0c0e8",
                caretColor: meta.color,
                minHeight: "96px",
                overflow: "hidden",
              }}
            />

            {/* Image attachments */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {images.map((img, i) => (
                  <div key={i} className="relative group" style={{ width: 56, height: 56 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.previewUrl}
                      alt={img.name}
                      className="w-full h-full object-cover rounded-lg"
                      style={{ border: "1px solid #2a2a48" }}
                    />
                    <button
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "#ff4466", color: "#fff" }}
                    >
                      <X size={9} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 mt-2 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ background: "#13131f", border: "1px solid #1e1e35", color: "#50508a" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#9090cc";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a2a48";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#50508a";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e1e35";
              }}
            >
              <Paperclip size={11} />
              Attach images
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>

          {/* Skills — always visible */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Zap size={11} style={{ color: "#6644ff" }} />
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#606090" }}>
                Skills
              </label>
              {skills.length > 0 && (
                <span className="text-xs ml-1" style={{ color: "#35355a" }}>click to insert /skill</span>
              )}
            </div>
            {skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <button
                    key={`${skill.source}-${skill.slug}`}
                    onClick={() => insertSkill(skill.slug)}
                    title={skill.description}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all"
                    style={{
                      background: skill.source === "project" ? "#6644ff15" : "#13131f",
                      border: `1px solid ${skill.source === "project" ? "#6644ff35" : "#1e1e35"}`,
                      color: skill.source === "project" ? "#9977ff" : "#60608a",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = skill.source === "project" ? "#6644ff25" : "#1e1e2a";
                      (e.currentTarget as HTMLButtonElement).style.color = skill.source === "project" ? "#bb99ff" : "#a0a0cc";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = skill.source === "project" ? "#6644ff15" : "#13131f";
                      (e.currentTarget as HTMLButtonElement).style.color = skill.source === "project" ? "#9977ff" : "#60608a";
                    }}
                  >
                    <span style={{ opacity: 0.6, fontSize: "10px" }}>/</span>
                    {skill.name}
                    {skill.source === "project" && (
                      <span className="text-xs" style={{ color: "#6644ff80", fontSize: "9px" }}>proj</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs leading-relaxed space-y-1" style={{ color: "#40406a" }}>
                <p>
                  No skills found. Add <code style={{ color: "#6644ffaa" }}>.md</code> files to either:
                </p>
                <p>
                  <span style={{ color: "#35355a" }}>Global: </span>
                  <code style={{ color: "#6644ff88" }}>~/.claude/commands/</code>
                </p>
                {skillsProjectDir && (
                  <p>
                    <span style={{ color: "#35355a" }}>Project: </span>
                    <code style={{ color: "#6644ff88", wordBreak: "break-all" }}>{skillsProjectDir}</code>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Example prompts */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#606090" }}>
              Examples
            </label>
            <div className="space-y-1.5">
              {EXAMPLE_PROMPTS[type].map((ex, i) => (
                <button key={i} onClick={() => setPrompt(ex)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg transition-colors truncate"
                  style={{ background: "#13131f", border: "1px solid #1e1e35", color: "#60608a" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "#a0a0cc";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a2a48";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "#60608a";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e1e35";
                  }}
                >
                  ↗ {ex}
                </button>
              ))}
            </div>
          </div>

          {/* No project warning */}
          {!hasProject && (
            <div className="text-xs px-3 py-2 rounded-lg"
              style={{ background: "#ff880015", border: "1px solid #ff880030", color: "#cc8844" }}>
              ⚠ No project set — agent will run without file access. Set a project path in the header first.
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!prompt.trim()}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all"
            style={{
              background: prompt.trim() ? `${meta.color}` : "#1e1e35",
              color: prompt.trim() ? "#000" : "#404060",
              cursor: prompt.trim() ? "pointer" : "not-allowed",
            }}
          >
            {meta.emoji} Launch {meta.label} ⌘↵
            {images.length > 0 && (
              <span className="ml-2 text-xs font-normal opacity-70">+ {images.length} image{images.length > 1 ? "s" : ""}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
