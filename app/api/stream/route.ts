import { query } from "@anthropic-ai/claude-agent-sdk";
import { NextRequest } from "next/server";
import { AGENT_META, AGENT_SYSTEM_PROMPTS, AgentType } from "@/lib/types";
import { db } from "@/lib/db";
import * as fs from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface IncomingImage {
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const prompt: string = body.prompt ?? "Introduce yourself.";
  const agentType: AgentType = body.type ?? "thinker";
  const cwd: string = body.cwd ?? process.env.HOME ?? "/";
  const resumeSessionId: string | undefined = body.resumeSessionId;
  const images: IncomingImage[] | undefined = body.images?.length ? body.images : undefined;

  if (!fs.existsSync(cwd)) {
    return Response.json({ error: `Path does not exist: ${cwd}` }, { status: 400 });
  }

  const meta = AGENT_META[agentType];
  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentType];
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      let sessionId: string | null = null;
      let isResume = !!resumeSessionId;

      try {
        const queryOptions: Record<string, unknown> = {
          cwd,
          allowedTools: meta.tools,
          systemPrompt: isResume ? undefined : systemPrompt,
          permissionMode: "acceptEdits",
          maxTurns: 30,
        };

        if (resumeSessionId) {
          queryOptions.resume = resumeSessionId;
        }

        // If images are attached, build a multimodal content array instead of a plain string
        const promptParam = images
          ? (async function* () {
              yield {
                type: "user" as const,
                message: {
                  role: "user" as const,
                  content: [
                    ...images.map((img) => ({
                      type: "image" as const,
                      source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
                    })),
                    { type: "text" as const, text: prompt },
                  ],
                },
                parent_tool_use_id: null,
                session_id: "",
              };
            })()
          : prompt;

        for await (const message of query({
          prompt: promptParam,
          options: queryOptions as Parameters<typeof query>[0]["options"],
        })) {
          const msg = message as Record<string, unknown>;

          if (msg.type === "system" && msg.subtype === "init") {
            sessionId = (msg.session_id as string) ?? null;
            send({ type: "system_init", session_id: sessionId });

            // Register in our DB
            if (sessionId) {
              db.upsertSession({
                session_id: sessionId,
                agent_type: agentType,
                prompt: isResume ? `[resumed] ${prompt}` : prompt,
                project_path: cwd,
                started_at: Date.now(),
                status: "running",
              });
            }
            continue;
          }

          if (msg.type === "assistant") {
            const inner = (msg.message ?? msg) as Record<string, unknown>;
            const content = (inner.content ?? []) as Array<Record<string, unknown>>;
            for (const block of content) {
              if (block.type === "text") {
                send({ type: "text_block", content: block.text as string });
              } else if (block.type === "tool_use") {
                send({ type: "tool_use", name: block.name as string, input: block.input, id: block.id });
              }
            }
            continue;
          }

          if (msg.type === "user") {
            const inner = (msg.message ?? msg) as Record<string, unknown>;
            const content = (inner.content ?? []) as Array<Record<string, unknown>>;
            for (const block of content) {
              if (block.type === "tool_result") {
                const resultContent = Array.isArray(block.content)
                  ? (block.content as Array<Record<string, unknown>>)
                      .map((c) => (c.type === "text" ? c.text : ""))
                      .join("")
                  : String(block.content ?? "");
                send({ type: "tool_result", tool_use_id: block.tool_use_id, content: resultContent.slice(0, 500) });
              }
            }
            continue;
          }

          if ("result" in msg) {
            const cost = msg.cost_usd as number | undefined;
            send({ type: "agent_complete", result: msg.result, stop_reason: msg.stop_reason, cost });

            if (sessionId) {
              db.completeSession(sessionId, cost ?? null, "done");
            }
            continue;
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        const isAuthErr =
          errMsg.toLowerCase().includes("auth") ||
          errMsg.toLowerCase().includes("login") ||
          errMsg.toLowerCase().includes("credentials") ||
          errMsg.toLowerCase().includes("unauthorized");

        send({
          type: isAuthErr ? "auth_error" : "agent_error",
          message: errMsg,
        });

        if (sessionId) {
          db.completeSession(sessionId, null, "error");
        }
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// Validate a path exists
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams.get("path");
  if (!p) return Response.json({ valid: false });
  const valid = fs.existsSync(p) && fs.statSync(p).isDirectory();
  return Response.json({ valid, path: p });
}
