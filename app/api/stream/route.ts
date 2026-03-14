import { query } from "@anthropic-ai/claude-agent-sdk";
import { NextRequest } from "next/server";
import { AGENT_META, AGENT_SYSTEM_PROMPTS, AgentType } from "@/lib/types";
import * as fs from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const prompt: string = body.prompt ?? "Introduce yourself.";
  const agentType: AgentType = body.type ?? "thinker";
  const cwd: string = body.cwd ?? process.env.HOME ?? "/";

  // Validate cwd exists
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
        } catch {
          // controller already closed
        }
      };

      try {
        for await (const message of query({
          prompt,
          options: {
            cwd,
            allowedTools: meta.tools,
            systemPrompt,
            permissionMode: "acceptEdits",
            maxTurns: 20,
          },
        })) {
          const msg = message as Record<string, unknown>;

          // System init message
          if (msg.type === "system" && msg.subtype === "init") {
            send({ type: "system_init", session_id: msg.session_id });
            continue;
          }

          // Assistant message with content blocks
          if (msg.type === "assistant") {
            const inner = (msg.message ?? msg) as Record<string, unknown>;
            const content = (inner.content ?? []) as Array<Record<string, unknown>>;

            for (const block of content) {
              if (block.type === "text") {
                send({ type: "text_block", content: block.text as string });
              } else if (block.type === "tool_use") {
                send({
                  type: "tool_use",
                  name: block.name as string,
                  input: block.input,
                  id: block.id,
                });
              }
            }
            continue;
          }

          // Tool result (user turn with tool_result)
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
                send({
                  type: "tool_result",
                  tool_use_id: block.tool_use_id,
                  content: resultContent.slice(0, 500), // truncate for UI
                });
              }
            }
            continue;
          }

          // Result message (final)
          if ("result" in msg) {
            send({
              type: "agent_complete",
              result: msg.result,
              stop_reason: msg.stop_reason,
              cost: msg.cost_usd,
            });
            continue;
          }
        }
      } catch (err) {
        send({
          type: "agent_error",
          message:
            err instanceof Error
              ? err.message
              : "Unknown error. Is the Claude CLI installed and authenticated?",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
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
