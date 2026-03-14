import { NextRequest } from "next/server";
import { listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export interface SessionSummary {
  sessionId: string;
  cwd: string;
  firstPrompt: string;
  summary: string;
  lastModified: number;
  createdAt: number;
  fileSize: number;
  // enriched from our DB
  agentType?: string;
  costUsd?: number;
  status?: string;
  endedAt?: number;
}

// GET /api/sessions?project=...&q=...&limit=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const project = searchParams.get("project") ?? undefined;
  const q = searchParams.get("q")?.toLowerCase() ?? "";
  const limit = parseInt(searchParams.get("limit") ?? "60", 10);

  try {
    // Get all sessions from SDK
    const sdkSessions = await listSessions();
    const sdkArr = Array.isArray(sdkSessions)
      ? sdkSessions
      : Object.values(sdkSessions as Record<string, unknown>);

    // Get our app sessions for enrichment
    const appSessions = db.listAppSessions(undefined, 500);
    const appMap = new Map(appSessions.map((s) => [s.session_id, s]));

    let sessions: SessionSummary[] = sdkArr.map((s: any) => {
      const app = appMap.get(s.sessionId);
      return {
        sessionId: s.sessionId,
        cwd: s.cwd ?? "",
        firstPrompt: s.firstPrompt ?? s.summary ?? "",
        summary: s.summary ?? s.firstPrompt ?? "",
        lastModified: s.lastModified ?? 0,
        createdAt: s.createdAt ?? 0,
        fileSize: s.fileSize ?? 0,
        agentType: app?.agent_type ?? undefined,
        costUsd: app?.cost_usd ?? undefined,
        status: app?.status ?? undefined,
        endedAt: app?.ended_at ?? undefined,
      };
    });

    // Filter by project
    if (project) {
      sessions = sessions.filter((s) => s.cwd === project);
    }

    // Full-text search
    if (q) {
      sessions = sessions.filter(
        (s) =>
          s.firstPrompt.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.cwd.toLowerCase().includes(q)
      );
    }

    // Sort by last modified desc, apply limit
    sessions = sessions
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, limit);

    return Response.json({ sessions });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to load sessions",
        sessions: [],
      },
      { status: 500 }
    );
  }
}

// GET /api/sessions/[id] — get full messages for a session
export async function POST(request: NextRequest) {
  const { sessionId } = await request.json();
  if (!sessionId)
    return Response.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    const messages = await getSessionMessages(sessionId, { limit: 200 });
    return Response.json({ messages });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load messages" },
      { status: 500 }
    );
  }
}
