"use client";
import { useState, useEffect, useRef } from "react";
import { FolderOpen, ChevronDown, Check, X, AlertCircle } from "lucide-react";

const STORAGE_KEY = "agent-dashboard:recent-projects";
const MAX_RECENT = 8;

function loadRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecents(paths: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths.slice(0, MAX_RECENT)));
}

export function addRecentProject(path: string) {
  const recents = loadRecents().filter((p) => p !== path);
  saveRecents([path, ...recents]);
}

interface Props {
  value: string;
  onChange: (path: string) => void;
}

export function ProjectSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecents(loadRecents());
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
        setDraft(value);
        setError(null);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, value]);

  const validate = async (path: string) => {
    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`/api/stream?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.valid) {
        onChange(path);
        addRecentProject(path);
        setRecents(loadRecents());
        setOpen(false);
        setEditing(false);
        setError(null);
      } else {
        setError("Path not found or not a directory");
      }
    } catch {
      setError("Could not validate path");
    } finally {
      setValidating(false);
    }
  };

  const dirName = value ? value.split("/").filter(Boolean).pop() ?? value : "No project";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setOpen((o) => !o); setDraft(value); setEditing(false); setError(null); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
        style={{
          background: open ? "#1a1a30" : "#13131f",
          border: "1px solid #2a2a48",
          color: value ? "#c0c0e8" : "#606090",
        }}
      >
        <FolderOpen size={13} style={{ color: value ? "#6644ff" : "#404060" }} />
        <span className="max-w-[180px] truncate font-medium">
          {dirName}
        </span>
        {value && (
          <span className="text-xs max-w-[100px] truncate" style={{ color: "#40406a" }}>
            {value.replace(/\/[^/]+$/, "")}
          </span>
        )}
        <ChevronDown size={12} style={{ color: "#404060" }} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden"
          style={{
            width: 340,
            background: "#0e0e1a",
            border: "1px solid #2a2a48",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          {/* Path input */}
          <div className="p-3" style={{ borderBottom: "1px solid #1e1e35" }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#404070" }}>
              Project Path
            </div>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") validate(draft);
                  if (e.key === "Escape") { setOpen(false); setDraft(value); }
                }}
                placeholder="/path/to/your/project"
                className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-mono outline-none"
                style={{
                  background: "#08080f",
                  border: `1px solid ${error ? "#ff446650" : "#2a2a48"}`,
                  color: "#c0c0e8",
                  caretColor: "#6644ff",
                }}
                autoFocus
              />
              <button
                onClick={() => validate(draft)}
                disabled={validating || !draft.trim()}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: draft.trim() ? "#6644ff" : "#1e1e35",
                  color: draft.trim() ? "#fff" : "#404060",
                }}
              >
                {validating ? "..." : "Set"}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs" style={{ color: "#ff6688" }}>
                <AlertCircle size={11} />
                {error}
              </div>
            )}
          </div>

          {/* Recent projects */}
          {recents.length > 0 && (
            <div className="p-2">
              <div className="text-xs font-semibold uppercase tracking-wider px-2 mb-1.5" style={{ color: "#404070" }}>
                Recent
              </div>
              {recents.map((path) => {
                const name = path.split("/").filter(Boolean).pop() ?? path;
                const parent = path.replace(/\/[^/]+$/, "");
                const selected = path === value;
                return (
                  <button
                    key={path}
                    onClick={() => { onChange(path); setOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors"
                    style={{
                      background: selected ? "#6644ff20" : "transparent",
                      border: `1px solid ${selected ? "#6644ff40" : "transparent"}`,
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) (e.currentTarget as HTMLButtonElement).style.background = "#13131f";
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    }}
                  >
                    <FolderOpen size={13} style={{ color: selected ? "#8866ff" : "#404060", flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: selected ? "#c0b0ff" : "#a0a0cc" }}>
                        {name}
                      </div>
                      <div className="text-xs truncate" style={{ color: "#35355a" }}>
                        {parent}
                      </div>
                    </div>
                    {selected && <Check size={12} style={{ color: "#8866ff", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          )}

          {recents.length === 0 && (
            <div className="p-4 text-center text-xs" style={{ color: "#35355a" }}>
              Enter a project path above to get started
            </div>
          )}
        </div>
      )}
    </div>
  );
}
