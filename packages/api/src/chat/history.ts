import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import { canChatWithCompanion, loadCompanionForChat, loadThread } from "./loaders";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type HistoryRow = {
  id: string;
  role: string;
  content: string;
  scene_id: string | null;
  signals: string | null;
  emotion: string | null;
  created_at: number;
};

type MomentImageRow = {
  message_id: string;
  job_id: string;
  status: string;
  output_key: string | null;
};

export async function handleGetHistory(
  env: Env,
  user: UserRecord,
  companionId: string,
  url: URL,
): Promise<Response> {
  const companion = await loadCompanionForChat(env, companionId);
  if (!companion || !canChatWithCompanion(companion, user)) {
    return notFound();
  }

  const thread = await loadThread(env, user.id, companionId);
  if (!thread) {
    return jsonResponse({
      messages: [],
      next_cursor: null,
      thread: { message_count: 0, summary: null },
    });
  }

  const limit = parseLimit(url.searchParams.get("limit"));
  const beforeId = url.searchParams.get("before_id");

  let cursorTs: number | null = null;
  if (beforeId) {
    const cursorRow = await env.DB.prepare(
      `SELECT created_at FROM messages WHERE id = ? AND thread_id = ?`,
    )
      .bind(beforeId, thread.id)
      .first<{ created_at: number }>();
    if (cursorRow) {
      cursorTs = cursorRow.created_at;
    }
  }

  const params: unknown[] = [thread.id];
  let sql =
    `SELECT id, role, content, scene_id, signals, emotion, created_at
     FROM messages
     WHERE thread_id = ?`;
  if (cursorTs !== null) {
    sql += " AND created_at < ?";
    params.push(cursorTs);
  }
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit + 1);

  const { results } = await env.DB.prepare(sql).bind(...params).all<HistoryRow>();
  const rows = results ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  const moments = await loadMomentImages(
    env,
    user.id,
    page.filter((r) => r.role === "companion").map((r) => r.id),
  );

  const messages = page
    .slice()
    .reverse()
    .map((row) => ({
      content: row.content,
      created_at: row.created_at,
      emotion: row.emotion,
      id: row.id,
      moment_image: row.role === "companion" ? moments.get(row.id) ?? null : null,
      role: row.role,
      scene_id: row.scene_id ?? null,
      signals: row.role === "companion" ? parseSignals(row.signals) : null,
    }));

  return jsonResponse({
    messages,
    next_cursor: nextCursor,
    thread: { message_count: thread.message_count, summary: thread.summary },
  });
}

export async function handleDeleteHistory(
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<Response> {
  const companion = await loadCompanionForChat(env, companionId);
  if (!companion || !canChatWithCompanion(companion, user)) {
    return notFound();
  }

  const thread = await loadThread(env, user.id, companionId);
  if (!thread) {
    return new Response(null, { status: 204 });
  }

  await env.DB.prepare(`DELETE FROM messages WHERE thread_id = ?`).bind(thread.id).run();
  await env.DB.prepare(
    `UPDATE threads
     SET message_count = 0, summary = NULL, summary_until_message_id = NULL, updated_at = ?
     WHERE id = ?`,
  )
    .bind(Date.now(), thread.id)
    .run();

  return new Response(null, { status: 204 });
}

type MomentImagePublic = { job_id: string; status: string; output_key: string | null };

async function loadMomentImages(
  env: Env,
  userId: string,
  messageIds: string[],
): Promise<Map<string, MomentImagePublic>> {
  const map = new Map<string, MomentImagePublic>();
  if (messageIds.length === 0) return map;

  const placeholders = messageIds.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT message_id, job_id, status, output_key
     FROM story_moment_images
     WHERE user_id = ? AND message_id IN (${placeholders})`,
  )
    .bind(userId, ...messageIds)
    .all<MomentImageRow>();

  for (const row of results ?? []) {
    map.set(row.message_id, {
      job_id: row.job_id,
      output_key: row.output_key ?? null,
      status: row.status,
    });
  }
  return map;
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return n;
}

function parseSignals(raw: string | null): Record<string, number> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, number>;
    }
  } catch {
    // fall through
  }
  return null;
}
