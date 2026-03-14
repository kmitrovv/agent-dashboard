"use client";
import { useCallback } from "react";
import { Agent } from "./types";

type UpdateFn = (id: string, updater: (agent: Agent) => Agent) => void;

export function useAgentStream(
  updateAgent: UpdateFn,
  onAuthError?: () => void
) {
  const startStream = useCallback(
    async (agent: Agent) => {
      updateAgent(agent.id, (a) => ({ ...a, status: "running" }));

      try {
        const response = await fetch("/api/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: agent.prompt,
            type: agent.type,
            cwd: agent.cwd,
            resumeSessionId: agent.resumeSessionId,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Request failed" }));
          throw new Error(err.error ?? `HTTP ${response.status}`);
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            let event: Record<string, unknown>;
            try { event = JSON.parse(raw); } catch { continue; }
            handleEvent(agent.id, event, updateAgent, onAuthError);
          }
        }
      } catch (err) {
        updateAgent(agent.id, (a) => ({
          ...a,
          status: "error",
          error: err instanceof Error ? err.message : "Stream failed",
          endedAt: Date.now(),
        }));
      }
    },
    [updateAgent, onAuthError]
  );

  return { startStream };
}

function handleEvent(
  agentId: string,
  event: Record<string, unknown>,
  update: UpdateFn,
  onAuthError?: () => void
) {
  const type = event.type as string;

  if (type === "system_init") {
    update(agentId, (a) => ({ ...a, sessionId: event.session_id as string }));
  } else if (type === "text_block") {
    update(agentId, (a) => ({
      ...a,
      blocks: [...a.blocks, { type: "text", content: (event.content as string) ?? "" }],
    }));
  } else if (type === "tool_use") {
    update(agentId, (a) => ({
      ...a,
      blocks: [...a.blocks, {
        type: "tool_use",
        content: "",
        toolName: event.name as string,
        toolInput: event.input as Record<string, unknown>,
      }],
    }));
  } else if (type === "tool_result") {
    update(agentId, (a) => ({
      ...a,
      blocks: [...a.blocks, { type: "tool_result", content: (event.content as string) ?? "" }],
    }));
  } else if (type === "agent_complete") {
    update(agentId, (a) => ({
      ...a,
      status: "done",
      endedAt: Date.now(),
      cost: event.cost as number | undefined,
    }));
  } else if (type === "auth_error") {
    update(agentId, (a) => ({
      ...a,
      status: "error",
      error: "Not authenticated. Please log in.",
      endedAt: Date.now(),
    }));
    onAuthError?.();
  } else if (type === "agent_error") {
    update(agentId, (a) => ({
      ...a,
      status: "error",
      error: (event.message as string) ?? "Unknown error",
      endedAt: Date.now(),
    }));
  }
}
