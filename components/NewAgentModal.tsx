"use client";
import { useState, useEffect, useRef } from "react";
import { AgentType, AGENT_META } from "@/lib/types";
import { X, Sparkles } from "lucide-react";

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

interface Props {
  onSubmit: (type: AgentType, prompt: string) => void;
  onClose: () => void;
  hasProject?: boolean;
}

export function NewAgentModal({ onSubmit, onClose, hasProject = false }: Props) {
  const [type, setType] = useState<AgentType>("thinker");
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = () => {
    const p = prompt.trim();
    if (!p) return;
    onSubmit(type, p);
    onClose();
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
        style={{ background: "#0e0e1a", border: "1px solid #2a2a48" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid #1e1e35" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: meta.color }} />
            <span className="font-semibold text-sm" style={{ color: "#e0e0ff" }}>
              New Agent
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: "#606090" }}
          >
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
                  <button
                    key={t}
                    onClick={() => setType(t)}
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
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
              placeholder="What should this agent work on?"
              rows={3}
              className="w-full rounded-lg px-3 py-2.5 text-sm resize-none outline-none transition-colors"
              style={{
                background: "#08080f",
                border: `1px solid ${prompt ? meta.color + "50" : "#1e1e35"}`,
                color: "#c0c0e8",
                caretColor: meta.color,
              }}
            />
          </div>

          {/* Example prompts */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: "#606090" }}>
              Examples
            </label>
            <div className="space-y-1.5">
              {EXAMPLE_PROMPTS[type].map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(ex)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg transition-colors truncate"
                  style={{
                    background: "#13131f",
                    border: "1px solid #1e1e35",
                    color: "#60608a",
                  }}
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
            <div
              className="text-xs px-3 py-2 rounded-lg"
              style={{ background: "#ff880015", border: "1px solid #ff880030", color: "#cc8844" }}
            >
              ⚠ No project set — agent will run without file access. Set a project path in the header first.
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim()}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all"
            style={{
              background: prompt.trim() ? `${meta.color}` : "#1e1e35",
              color: prompt.trim() ? "#000" : "#404060",
              cursor: prompt.trim() ? "pointer" : "not-allowed",
            }}
          >
            {meta.emoji} Launch {meta.label} ⌘↵
          </button>
        </div>
      </div>
    </div>
  );
}
