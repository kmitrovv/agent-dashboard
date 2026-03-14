"use client";
import { AgentStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; color: string; dotColor: string; pulse: boolean }
> = {
  queued: { label: "QUEUED", color: "#6060a0", dotColor: "#6060a0", pulse: false },
  running: { label: "RUNNING", color: "#00cc88", dotColor: "#00ff99", pulse: true },
  done: { label: "DONE", color: "#4488ff", dotColor: "#4488ff", pulse: false },
  error: { label: "ERROR", color: "#ff4466", dotColor: "#ff4466", pulse: false },
};

export function StatusBadge({ status }: { status: AgentStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono font-semibold"
      style={{
        color: cfg.color,
        backgroundColor: `${cfg.color}18`,
        border: `1px solid ${cfg.color}40`,
      }}
    >
      <span className="relative flex h-1.5 w-1.5">
        {cfg.pulse && (
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{
              backgroundColor: cfg.dotColor,
              animation: "ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite",
            }}
          />
        )}
        <span
          className="relative inline-flex rounded-full h-1.5 w-1.5"
          style={{ backgroundColor: cfg.dotColor }}
        />
      </span>
      {cfg.label}
    </div>
  );
}
