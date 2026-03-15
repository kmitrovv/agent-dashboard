"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { FolderOpen, FolderRoot, ChevronDown, Check, X, AlertCircle, Settings2 } from "lucide-react";

const STORAGE_KEY = "agent-dashboard:recent-projects";
const ROOT_KEY = "agent-dashboard:projects-root";
const MAX_RECENT = 8;

function loadRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function saveRecents(paths: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths.slice(0, MAX_RECENT)));
}
export function addRecentProject(path: string) {
  const recents = loadRecents().filter((p) => p !== path);
  saveRecents([path, ...recents]);
}

interface DirEntry { name: string; path: string }

interface Props {
  value: string;
  onChange: (path: string) => void;
}

export function ProjectSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"browse" | "manual">("browse");
  const [root, setRoot] = useState<string>("");
  const [rootDraft, setRootDraft] = useState("");
  const [editingRoot, setEditingRoot] = useState(false);
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [loadingDirs, setLoadingDirs] = useState(false);
  const [dirsError, setDirsError] = useState<string | null>(null);
  const [manual, setManual] = useState(value);
  const [validating, setValidating] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load root & recents from localStorage
  useEffect(() => {
    const savedRoot = localStorage.getItem(ROOT_KEY) ?? "";
    if (savedRoot) { setRoot(savedRoot); setRootDraft(savedRoot); }
    setRecents(loadRecents());
  }, []);

  // Load dirs when root changes
  const loadDirs = useCallback(async (r: string) => {
    if (!r.trim()) return;
    setLoadingDirs(true);
    setDirsError(null);
    try {
      const res = await fetch(`/api/browse?root=${encodeURIComponent(r)}`);
      const data = await res.json();
      if (data.error) { setDirsError(data.error); setDirs([]); }
      else { setDirs(data.dirs ?? []); }
    } catch { setDirsError("Could not load projects"); setDirs([]); }
    finally { setLoadingDirs(false); }
  }, []);

  useEffect(() => {
    if (root) loadDirs(root);
  }, [root, loadDirs]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingRoot(false);
        setManualError(null);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const saveRoot = async (r: string) => {
    const trimmed = r.trim();
    if (!trimmed) return;
    setRoot(trimmed);
    setRootDraft(trimmed);
    localStorage.setItem(ROOT_KEY, trimmed);
    setEditingRoot(false);
    await loadDirs(trimmed);
  };

  const selectProject = (path: string) => {
    onChange(path);
    addRecentProject(path);
    setRecents(loadRecents());
    setOpen(false);
    setManualError(null);
  };

  const validateManual = async (path: string) => {
    setValidating(true);
    setManualError(null);
    try {
      const res = await fetch(`/api/stream?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.valid) { selectProject(path); }
      else { setManualError("Path not found or not a directory"); }
    } catch { setManualError("Could not validate path"); }
    finally { setValidating(false); }
  };

  const dirName = value ? value.split("/").filter(Boolean).pop() ?? value : "No project";
  const parentDir = value ? value.replace(/\/[^/]+$/, "") : "";

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen((o) => !o); setManual(value); setManualError(null); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
        style={{ background: open ? "#1a1a30" : "#13131f", border: "1px solid #2a2a48", color: value ? "#c0c0e8" : "#606090" }}
      >
        <FolderOpen size={13} style={{ color: value ? "#6644ff" : "#404060" }} />
        <span className="max-w-[160px] truncate font-medium">{dirName}</span>
        {value && <span className="text-xs max-w-[90px] truncate" style={{ color: "#40406a" }}>{parentDir}</span>}
        <ChevronDown size={12} style={{ color: "#404060" }} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden"
          style={{ width: 360, background: "#0e0e1a", border: "1px solid #2a2a48", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
        >
          {/* Tabs */}
          <div className="flex" style={{ borderBottom: "1px solid #1e1e35" }}>
            {(["browse", "manual"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className="flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors"
                style={{
                  color: tab === t ? "#9977ff" : "#404070",
                  borderBottom: tab === t ? "2px solid #6644ff" : "2px solid transparent",
                  background: "transparent",
                }}
              >
                {t === "browse" ? "📁 Browse" : "✏️ Manual"}
              </button>
            ))}
          </div>

          {tab === "browse" && (
            <div>
              {/* Root setter */}
              <div className="p-3" style={{ borderBottom: "1px solid #1e1e35" }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <FolderRoot size={12} style={{ color: "#6644ff" }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#404070" }}>
                    Projects Root
                  </span>
                  {root && !editingRoot && (
                    <button onClick={() => { setEditingRoot(true); setRootDraft(root); }}
                      className="ml-auto p-0.5 rounded transition-colors hover:bg-white/5"
                      style={{ color: "#404060" }}
                    >
                      <Settings2 size={11} />
                    </button>
                  )}
                </div>
                {editingRoot || !root ? (
                  <div className="flex gap-2">
                    <input
                      value={rootDraft}
                      onChange={(e) => setRootDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRoot(rootDraft);
                        if (e.key === "Escape") { setEditingRoot(false); setRootDraft(root); }
                      }}
                      placeholder="~/projects"
                      autoFocus
                      className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-mono outline-none"
                      style={{ background: "#08080f", border: "1px solid #2a2a48", color: "#c0c0e8", caretColor: "#6644ff" }}
                    />
                    <button onClick={() => saveRoot(rootDraft)} disabled={!rootDraft.trim()}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: rootDraft.trim() ? "#6644ff" : "#1e1e35", color: rootDraft.trim() ? "#fff" : "#404060" }}
                    >
                      Set
                    </button>
                    {editingRoot && (
                      <button onClick={() => { setEditingRoot(false); setRootDraft(root); }}
                        className="p-1.5 rounded-lg" style={{ color: "#404060" }}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-xs font-mono truncate" style={{ color: "#6655bb" }}>{root}</div>
                )}
              </div>

              {/* Project list */}
              <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
                {!root ? (
                  <div className="p-5 text-center text-xs" style={{ color: "#35355a" }}>
                    Set a projects root directory above to browse projects
                  </div>
                ) : loadingDirs ? (
                  <div className="p-4 text-center text-xs" style={{ color: "#404070" }}>Loading…</div>
                ) : dirsError ? (
                  <div className="p-3 flex items-center gap-1.5 text-xs" style={{ color: "#ff6688" }}>
                    <AlertCircle size={11} /> {dirsError}
                  </div>
                ) : dirs.length === 0 ? (
                  <div className="p-4 text-center text-xs" style={{ color: "#35355a" }}>No subdirectories found</div>
                ) : (
                  <div className="p-1.5">
                    {dirs.map((d) => {
                      const selected = d.path === value;
                      return (
                        <button key={d.path} onClick={() => selectProject(d.path)}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors"
                          style={{
                            background: selected ? "#6644ff20" : "transparent",
                            border: `1px solid ${selected ? "#6644ff40" : "transparent"}`,
                          }}
                          onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = "#13131f"; }}
                          onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                          <FolderOpen size={13} style={{ color: selected ? "#8866ff" : "#404060", flexShrink: 0 }} />
                          <span className="flex-1 text-xs font-medium truncate" style={{ color: selected ? "#c0b0ff" : "#a0a0cc" }}>
                            {d.name}
                          </span>
                          {selected && <Check size={12} style={{ color: "#8866ff", flexShrink: 0 }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "manual" && (
            <div>
              <div className="p-3" style={{ borderBottom: "1px solid #1e1e35" }}>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#404070" }}>
                  Full Path
                </div>
                <div className="flex gap-2">
                  <input
                    value={manual}
                    onChange={(e) => { setManual(e.target.value); setManualError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") validateManual(manual);
                      if (e.key === "Escape") setOpen(false);
                    }}
                    placeholder="/path/to/your/project"
                    autoFocus
                    className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-mono outline-none"
                    style={{ background: "#08080f", border: `1px solid ${manualError ? "#ff446650" : "#2a2a48"}`, color: "#c0c0e8", caretColor: "#6644ff" }}
                  />
                  <button onClick={() => validateManual(manual)} disabled={validating || !manual.trim()}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: manual.trim() ? "#6644ff" : "#1e1e35", color: manual.trim() ? "#fff" : "#404060" }}
                  >
                    {validating ? "…" : "Set"}
                  </button>
                </div>
                {manualError && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs" style={{ color: "#ff6688" }}>
                    <AlertCircle size={11} /> {manualError}
                  </div>
                )}
              </div>

              {/* Recents */}
              {recents.length > 0 && (
                <div className="p-1.5 overflow-y-auto" style={{ maxHeight: 220 }}>
                  <div className="text-xs font-semibold uppercase tracking-wider px-2 py-1.5" style={{ color: "#404070" }}>
                    Recent
                  </div>
                  {recents.map((p) => {
                    const name = p.split("/").filter(Boolean).pop() ?? p;
                    const parent = p.replace(/\/[^/]+$/, "");
                    const selected = p === value;
                    return (
                      <button key={p} onClick={() => selectProject(p)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors"
                        style={{ background: selected ? "#6644ff20" : "transparent", border: `1px solid ${selected ? "#6644ff40" : "transparent"}` }}
                        onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = "#13131f"; }}
                        onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                      >
                        <FolderOpen size={13} style={{ color: selected ? "#8866ff" : "#404060", flexShrink: 0 }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate" style={{ color: selected ? "#c0b0ff" : "#a0a0cc" }}>{name}</div>
                          <div className="text-xs truncate" style={{ color: "#35355a" }}>{parent}</div>
                        </div>
                        {selected && <Check size={12} style={{ color: "#8866ff", flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              )}
              {recents.length === 0 && (
                <div className="p-4 text-center text-xs" style={{ color: "#35355a" }}>No recent projects yet</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
