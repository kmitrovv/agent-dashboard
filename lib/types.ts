export type AgentType =
  | "researcher"
  | "coder"
  | "analyst"
  | "writer"
  | "thinker"
  | "planner";

export type AgentStatus = "queued" | "running" | "done" | "error";

export interface ContentBlock {
  type: "thinking" | "text" | "tool_use" | "tool_result" | "system";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isStreaming?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  prompt: string;
  cwd: string;
  status: AgentStatus;
  blocks: ContentBlock[];
  startedAt: number;
  endedAt?: number;
  cost?: number;
  error?: string;
  sessionId?: string;        // assigned after agent starts (from system_init)
  resumeSessionId?: string;  // set when resuming a past session
}

export const AGENT_META: Record<
  AgentType,
  { label: string; emoji: string; color: string; tools: string[] }
> = {
  researcher: {
    label: "Researcher",
    emoji: "🔍",
    color: "#3b82f6",
    tools: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
  },
  coder: {
    label: "Coder",
    emoji: "💻",
    color: "#22c55e",
    tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
  },
  analyst: {
    label: "Analyst",
    emoji: "📊",
    color: "#eab308",
    tools: ["Read", "Glob", "Grep", "Bash"],
  },
  writer: {
    label: "Writer",
    emoji: "✍️",
    color: "#a855f7",
    tools: ["Read", "Edit", "Write", "Glob"],
  },
  thinker: {
    label: "Thinker",
    emoji: "🧠",
    color: "#ec4899",
    tools: ["Read", "Glob", "Grep"],
  },
  planner: {
    label: "Planner",
    emoji: "🗺️",
    color: "#f97316",
    tools: ["Read", "Glob", "Grep", "Bash"],
  },
};

export const AGENT_SYSTEM_PROMPTS: Record<AgentType, string> = {
  researcher:
    "You are an expert researcher. Investigate the codebase and topic deeply. Find connections, patterns, and provide comprehensive insights with clear structure.",
  coder:
    "You are an expert software engineer. Read the existing code carefully, understand patterns and conventions, then write clean, idiomatic, well-integrated code.",
  analyst:
    "You are a sharp analyst. Examine the codebase systematically. Identify patterns, bottlenecks, quality issues, and provide clear actionable findings.",
  writer:
    "You are a skilled technical writer. Read existing docs and code, then write clear, accurate, well-structured documentation or content.",
  thinker:
    "You are a deep thinker. Explore the problem from multiple angles, surface hidden complexities, challenge assumptions, and synthesize novel insights.",
  planner:
    "You are an expert technical planner. Understand the current state of the codebase, then create detailed, realistic, actionable plans.",
};
