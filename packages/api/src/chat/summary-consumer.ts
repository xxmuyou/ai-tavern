import { LLMError, llmCall } from "../llm";

import type { SummaryJobPayload } from "./summary-queue";

const SUMMARY_BATCH_LIMIT = 200;
const SUMMARY_OUTPUT_TOKENS = 400;

type ThreadRow = {
  id: string;
  summary: string | null;
  summary_until_message_id: string | null;
};

type MessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: number;
};

function isSummaryPayload(value: unknown): value is SummaryJobPayload {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return obj.type === "chat.summary" && typeof obj.thread_id === "string";
}

export async function handleQueueBatch(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    if (!isSummaryPayload(message.body)) {
      message.ack();
      continue;
    }
    try {
      await processSummary(env, message.body);
      message.ack();
    } catch (err) {
      if (err instanceof LLMError && !err.retryable) {
        console.warn(
          JSON.stringify({
            error: err.message,
            error_code: err.code,
            message: "Summary job dropped (non-retryable LLM config error)",
            thread_id: message.body.thread_id,
          }),
        );
        message.ack();
        continue;
      }
      console.error(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          message: "Summary job failed, will retry",
          thread_id: message.body.thread_id,
        }),
      );
      message.retry();
    }
  }
}

export async function processSummary(
  env: Env,
  payload: SummaryJobPayload,
): Promise<void> {
  const thread = await env.DB.prepare(
    `SELECT id, summary, summary_until_message_id
     FROM threads
     WHERE id = ?`,
  )
    .bind(payload.thread_id)
    .first<ThreadRow>();

  if (!thread) {
    return;
  }

  const messages = await loadMessagesSince(env, thread);
  if (messages.length === 0) {
    return;
  }

  const response = await llmCall(
    env,
    {
      max_tokens: SUMMARY_OUTPUT_TOKENS,
      messages: buildSummaryPrompt(thread.summary, messages),
      task: "summary",
      temperature: 0.3,
    },
    { user_id: null },
  );

  const summaryText = response.text.trim();
  if (!summaryText) {
    return;
  }

  const latestMessageId = messages[messages.length - 1]!.id;
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE threads
     SET summary = ?, summary_until_message_id = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(summaryText, latestMessageId, now, thread.id)
    .run();
}

async function loadMessagesSince(env: Env, thread: ThreadRow): Promise<MessageRow[]> {
  let cursorTs: number | null = null;
  if (thread.summary_until_message_id) {
    const cursorRow = await env.DB.prepare(
      `SELECT created_at FROM messages WHERE id = ? AND thread_id = ?`,
    )
      .bind(thread.summary_until_message_id, thread.id)
      .first<{ created_at: number }>();
    if (cursorRow) {
      cursorTs = cursorRow.created_at;
    }
  }

  const params: unknown[] = [thread.id];
  let sql =
    `SELECT id, role, content, created_at
     FROM messages
     WHERE thread_id = ?`;
  if (cursorTs !== null) {
    sql += " AND created_at > ?";
    params.push(cursorTs);
  }
  sql += " ORDER BY created_at ASC LIMIT ?";
  params.push(SUMMARY_BATCH_LIMIT);

  const { results } = await env.DB.prepare(sql).bind(...params).all<MessageRow>();
  return results ?? [];
}

function buildSummaryPrompt(
  priorSummary: string | null,
  messages: MessageRow[],
): { role: "system" | "user"; content: string }[] {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Companion"}: ${m.content}`)
    .join("\n");

  const system =
    "You are a memory writer for a conversational companion. Compress the dialogue " +
    "into a concise third-person summary (under 200 words) that preserves: who, when, " +
    "key topics, emotional tone, decisions made, promises, and unresolved threads. " +
    "Keep proper nouns. Avoid filler.";

  const user = priorSummary
    ? `Previous summary so far:\n${priorSummary}\n\nNew messages since:\n${transcript}\n\nProduce an updated, self-contained summary that merges the prior summary with the new messages.`
    : `Conversation transcript:\n${transcript}\n\nWrite the summary.`;

  return [
    { content: system, role: "system" },
    { content: user, role: "user" },
  ];
}
