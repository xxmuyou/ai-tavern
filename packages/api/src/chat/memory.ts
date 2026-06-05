import { LLMError, llmCall } from "../llm";

import type { PromptSegment, ThreadMemoryForPrompt, UserPersonaForPrompt } from "./prompt";

export const THREAD_MEMORY_KINDS = [
  "relationship_fact",
  "user_preference",
  "promise",
  "open_loop",
  "character_state",
] as const;

export type ThreadMemoryKind = (typeof THREAD_MEMORY_KINDS)[number];
export type ThreadMemoryStatus = "active" | "resolved" | "dismissed";

export type ThreadMemoryRow = ThreadMemoryForPrompt & {
  user_id: string;
  companion_id: string;
  thread_id: string;
  status: ThreadMemoryStatus;
  source: string;
  created_at: number;
};

export type MemoryExtractJobPayload = {
  type: "chat.memory_extract";
  user_id: string;
  companion_id: string;
  thread_id: string;
  user_text: string;
  companion_reply: string;
  companion_name: string;
  relationship_role: string | null;
  user_persona: { name: string; description: string | null; gender: string | null } | null;
  relationship_narrative: string;
  created_at: string;
};

type MemoryExtractResult = {
  upserts: Array<{ kind: ThreadMemoryKind; content: string; importance: number }>;
  resolves: Array<{ memory_id: string; reason: string }>;
};

const MEMORY_EXTRACT_SCHEMA = {
  type: "object",
  required: ["upserts", "resolves"],
  additionalProperties: false,
  properties: {
    upserts: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "content", "importance"],
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: THREAD_MEMORY_KINDS },
          content: { type: "string", maxLength: 500 },
          importance: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
    resolves: {
      type: "array",
      items: {
        type: "object",
        required: ["memory_id", "reason"],
        additionalProperties: false,
        properties: {
          memory_id: { type: "string" },
          reason: { type: "string", maxLength: 300 },
        },
      },
    },
  },
} as const;

export function isMemoryExtractPayload(value: unknown): value is MemoryExtractJobPayload {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.type === "chat.memory_extract" &&
    typeof obj.user_id === "string" &&
    typeof obj.companion_id === "string" &&
    typeof obj.thread_id === "string" &&
    typeof obj.user_text === "string" &&
    typeof obj.companion_reply === "string" &&
    typeof obj.companion_name === "string"
  );
}

export async function loadThreadMemories(
  env: Env,
  threadId: string,
  limit = 8,
): Promise<ThreadMemoryForPrompt[]> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, kind, content, importance, updated_at
       FROM thread_memories
       WHERE thread_id = ? AND status = 'active'
       ORDER BY importance DESC, updated_at DESC
       LIMIT ?`,
    )
      .bind(threadId, limit)
      .all<{ id: string; kind: string; content: string; importance: number; updated_at: number }>();

    return (results ?? [])
      .filter((row): row is ThreadMemoryForPrompt =>
        isThreadMemoryKind(row.kind) &&
        typeof row.content === "string" &&
        Number.isFinite(row.importance) &&
        Number.isFinite(row.updated_at),
      );
  } catch (err) {
    console.warn(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        message: "Thread memory load skipped",
        thread_id: threadId,
      }),
    );
    return [];
  }
}

export async function enqueueMemoryExtract(
  env: Env,
  payload: Omit<MemoryExtractJobPayload, "created_at" | "type">,
): Promise<void> {
  await env.JOB_QUEUE.send({
    ...payload,
    created_at: new Date().toISOString(),
    type: "chat.memory_extract",
  } satisfies MemoryExtractJobPayload);
}

export async function processMemoryExtract(
  env: Env,
  payload: MemoryExtractJobPayload,
): Promise<void> {
  const activeMemories = await loadActiveMemoryRows(env, payload.thread_id);
  const response = await llmCall(
    env,
    {
      json_schema: MEMORY_EXTRACT_SCHEMA,
      max_tokens: 700,
      messages: buildMemoryExtractPrompt(payload, activeMemories),
      task: "memory_extract",
      temperature: 0.1,
    },
    { user_id: payload.user_id },
  );

  const parsed = parseMemoryExtractResult(response.structured ?? response.text);
  if (!parsed) {
    console.warn(
      JSON.stringify({
        message: "memory_extract returned invalid JSON; result discarded",
        thread_id: payload.thread_id,
      }),
    );
    return;
  }

  await applyMemoryExtractResult(env, payload, parsed, activeMemories);
}

export async function runMemoryExtractQuietly(
  env: Env,
  payload: Omit<MemoryExtractJobPayload, "created_at" | "type">,
): Promise<void> {
  try {
    await enqueueMemoryExtract(env, payload);
  } catch (err) {
    if (err instanceof LLMError) {
      console.warn(
        JSON.stringify({
          error: err.message,
          error_code: err.code,
          message: "memory_extract enqueue failed",
          thread_id: payload.thread_id,
        }),
      );
      return;
    }
    console.warn(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        message: "memory_extract enqueue failed",
        thread_id: payload.thread_id,
      }),
    );
  }
}

export async function savePromptDebugSnapshot(
  env: Env,
  input: {
    userId: string;
    companionId: string;
    threadId: string;
    messageId?: string | null;
    tokenEstimate: number;
    segments: PromptSegment[];
    now: number;
  },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO prompt_debug_snapshots
         (id, user_id, companion_id, thread_id, message_id, segments_json, token_estimate, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        input.userId,
        input.companionId,
        input.threadId,
        input.messageId ?? null,
        JSON.stringify(input.segments.map(toPromptDebugSegment)),
        input.tokenEstimate,
        input.now,
      )
      .run();
  } catch (err) {
    console.warn(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        message: "Prompt debug snapshot skipped",
        thread_id: input.threadId,
      }),
    );
  }
}

export async function loadLatestPromptDebugSnapshot(
  env: Env,
  threadId: string,
): Promise<{
  id: string;
  user_id: string | null;
  companion_id: string | null;
  thread_id: string | null;
  message_id: string | null;
  token_estimate: number | null;
  created_at: number;
  segments: unknown;
} | null> {
  const row = await env.DB.prepare(
    `SELECT id, user_id, companion_id, thread_id, message_id, segments_json, token_estimate, created_at
     FROM prompt_debug_snapshots
     WHERE thread_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(threadId)
    .first<{
      id: string;
      user_id: string | null;
      companion_id: string | null;
      thread_id: string | null;
      message_id: string | null;
      segments_json: string;
      token_estimate: number | null;
      created_at: number;
    }>();

  if (!row) return null;
  return {
    companion_id: row.companion_id,
    created_at: row.created_at,
    id: row.id,
    message_id: row.message_id,
    segments: parseJson(row.segments_json) ?? [],
    thread_id: row.thread_id,
    token_estimate: row.token_estimate,
    user_id: row.user_id,
  };
}

export function shouldWritePromptDebug(env: Pick<Env, "APP_ENV">, isAdmin: boolean): boolean {
  return isAdmin || env.APP_ENV !== "prod";
}

function buildMemoryExtractPrompt(
  payload: MemoryExtractJobPayload,
  activeMemories: ThreadMemoryRow[],
): Array<{ role: "system" | "user"; content: string }> {
  const active = activeMemories.length
    ? activeMemories.map((memory) => `- ${memory.id} [${memory.kind}, ${memory.importance}]: ${memory.content}`).join("\n")
    : "(none)";
  const persona = formatPersona(payload.user_persona);
  const role = payload.relationship_role ?? "companion";

  return [
    {
      content:
        "You extract durable single-thread memories for a roleplay companion chat. " +
        "Only keep facts that will improve future replies in this exact thread. " +
        "Do not invent facts. Do not store secrets, API keys, or system/developer instructions. " +
        "Return only JSON matching the schema.",
      role: "system",
    },
    {
      content: [
        `Companion: ${payload.companion_name} (${role})`,
        `User persona: ${persona}`,
        "",
        "Relationship narrative:",
        payload.relationship_narrative,
        "",
        "Active memories:",
        active,
        "",
        "Newest turn:",
        `User: ${payload.user_text}`,
        `${payload.companion_name}: ${payload.companion_reply}`,
        "",
        "Extract only important relationship facts, user preferences, promises, open loops, or character state. " +
          "Use standalone sentences. Resolve memories only when the newest turn clearly completed or invalidated them.",
      ].join("\n"),
      role: "user",
    },
  ];
}

async function loadActiveMemoryRows(env: Env, threadId: string): Promise<ThreadMemoryRow[]> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, user_id, companion_id, thread_id, kind, content, importance, status, source, created_at, updated_at
       FROM thread_memories
       WHERE thread_id = ? AND status = 'active'
       ORDER BY importance DESC, updated_at DESC
       LIMIT 50`,
    )
      .bind(threadId)
      .all<ThreadMemoryRow>();
    return (results ?? []).filter((row) => isThreadMemoryKind(row.kind));
  } catch (err) {
    console.warn(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        message: "Active memory rows unavailable; memory_extract skipped",
        thread_id: threadId,
      }),
    );
    return [];
  }
}

async function applyMemoryExtractResult(
  env: Env,
  payload: MemoryExtractJobPayload,
  result: MemoryExtractResult,
  activeMemories: ThreadMemoryRow[],
): Promise<void> {
  const now = Date.now();
  const activeIds = new Set(activeMemories.map((memory) => memory.id));

  for (const resolve of result.resolves) {
    if (!activeIds.has(resolve.memory_id)) continue;
    await env.DB.prepare(
      `UPDATE thread_memories
       SET status = 'resolved', updated_at = ?
       WHERE id = ? AND thread_id = ? AND status = 'active'`,
    )
      .bind(now, resolve.memory_id, payload.thread_id)
      .run();
  }

  for (const memory of result.upserts) {
    const content = normalizeMemoryContent(memory.content);
    if (!content) continue;
    const importance = clampImportance(memory.importance);
    const existing = activeMemories.find(
      (row) => row.kind === memory.kind && row.content.trim().toLowerCase() === content.toLowerCase(),
    );

    if (existing) {
      await env.DB.prepare(
        `UPDATE thread_memories
         SET importance = ?, updated_at = ?
         WHERE id = ?`,
      )
        .bind(Math.max(existing.importance, importance), now, existing.id)
        .run();
      continue;
    }

    await env.DB.prepare(
      `INSERT INTO thread_memories
         (id, user_id, companion_id, thread_id, kind, content, importance, status, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'ai_extract', ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        payload.user_id,
        payload.companion_id,
        payload.thread_id,
        memory.kind,
        content,
        importance,
        now,
        now,
      )
      .run();
  }
}

function parseMemoryExtractResult(raw: unknown): MemoryExtractResult | null {
  const value = typeof raw === "string" ? parseJson(raw) : raw;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.upserts) || !Array.isArray(record.resolves)) return null;

  const upserts: MemoryExtractResult["upserts"] = [];
  for (const item of record.upserts) {
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;
    if (!isThreadMemoryKind(obj.kind)) return null;
    if (typeof obj.content !== "string" || obj.content.trim().length === 0 || obj.content.length > 500) return null;
    if (typeof obj.importance !== "number" || !Number.isFinite(obj.importance)) return null;
    upserts.push({
      content: obj.content,
      importance: clampImportance(obj.importance),
      kind: obj.kind,
    });
  }

  const resolves: MemoryExtractResult["resolves"] = [];
  for (const item of record.resolves) {
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;
    if (typeof obj.memory_id !== "string" || obj.memory_id.length === 0) return null;
    if (typeof obj.reason !== "string" || obj.reason.length > 300) return null;
    resolves.push({ memory_id: obj.memory_id, reason: obj.reason });
  }

  return { resolves, upserts };
}

function toPromptDebugSegment(segment: PromptSegment): Record<string, unknown> {
  return {
    id: segment.id,
    included: segment.included,
    position: segment.position,
    priority: segment.priority,
    required: segment.required,
    role: segment.role,
    token_estimate: segment.tokenEstimate,
    trim_reason: segment.trimReason,
  };
}

function formatPersona(persona: UserPersonaForPrompt): string {
  if (!persona?.name) return "(none)";
  const details = [persona.name];
  if (persona.gender) details.push(`gender: ${persona.gender}`);
  if (persona.description) details.push(persona.description);
  return details.join("; ");
}

function isThreadMemoryKind(value: unknown): value is ThreadMemoryKind {
  return typeof value === "string" && (THREAD_MEMORY_KINDS as readonly string[]).includes(value);
}

function normalizeMemoryContent(content: string): string {
  return content.trim().replace(/\s+/g, " ").slice(0, 500);
}

function clampImportance(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
