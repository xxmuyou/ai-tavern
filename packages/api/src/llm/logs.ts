import type { LLMProvider, LLMTask } from "./types";

export type LLMLogEntry = {
  user_id: string | null;
  task: LLMTask;
  provider: LLMProvider;
  model: string;
  status: "success" | "fallback" | "error";
  latency_ms: number | null;
  token_input: number | null;
  token_output: number | null;
  cost_usd: number | null;
  error_code: string | null;
  error_message: string | null;
};

/**
 * Append a llm_logs row. Designed to be safe to call from `ctx.waitUntil` so
 * the request handler isn't blocked. Swallows all errors — we never want a
 * logging failure to break the chat path.
 */
export async function writeLLMLog(env: Env, entry: LLMLogEntry): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO llm_logs
         (id, user_id, task, provider, model, status,
          latency_ms, token_input, token_output, cost_usd,
          error_code, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        entry.user_id,
        entry.task,
        entry.provider,
        entry.model,
        entry.status,
        entry.latency_ms,
        entry.token_input,
        entry.token_output,
        entry.cost_usd,
        entry.error_code,
        entry.error_message,
        Date.now(),
      )
      .run();
  } catch (err) {
    console.warn(JSON.stringify({ message: "llm_logs write failed", error: String(err) }));
  }
}
