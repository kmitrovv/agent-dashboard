import { NextRequest } from "next/server";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import which from "which";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

async function getClaudePath(): Promise<string | null> {
  try {
    return await which("claude");
  } catch {
    return null;
  }
}

// GET /api/auth — check status
export async function GET() {
  const claudePath = await getClaudePath();
  if (!claudePath) {
    return Response.json({
      loggedIn: false,
      error: "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code",
    });
  }

  try {
    const { stdout } = await execFileAsync(claudePath, ["auth", "status"], {
      timeout: 8000,
    });
    const data = JSON.parse(stdout.trim());
    return Response.json({ ...data, cliPath: claudePath });
  } catch (err) {
    return Response.json({
      loggedIn: false,
      error: err instanceof Error ? err.message : "Auth check failed",
    });
  }
}

// POST /api/auth — start login flow (SSE)
export async function POST(request: NextRequest) {
  const claudePath = await getClaudePath();
  if (!claudePath) {
    return Response.json({ error: "Claude CLI not found" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {}
      };

      send({ type: "info", message: "Starting Claude login…" });

      const proc = spawn(claudePath, ["auth", "login"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        // Detect the auth URL
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          send({ type: "url", url: urlMatch[0], message: text.trim() });
        } else if (text.trim()) {
          send({ type: "info", message: text.trim() });
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) send({ type: "info", message: text });
      });

      proc.on("close", async (code) => {
        if (code === 0) {
          try {
            const { stdout } = await execFileAsync(
              claudePath,
              ["auth", "status"],
              { timeout: 5000 }
            );
            const status = JSON.parse(stdout.trim());
            send({ type: "success", ...status });
          } catch {
            send({ type: "success", message: "Login successful" });
          }
        } else {
          send({ type: "error", message: `Login exited with code ${code}` });
        }
        try {
          controller.close();
        } catch {}
      });

      proc.on("error", (err) => {
        send({ type: "error", message: err.message });
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
