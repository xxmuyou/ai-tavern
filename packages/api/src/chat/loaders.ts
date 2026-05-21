import type { UserRecord } from "../identity";

export type ChatCompanionRow = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
  name: string;
  appearance: string | null;
  personality: string | null;
  background: string | null;
  speech_style: string | null;
  relationship_role: string | null;
};

export type ChatSceneRow = {
  id: string;
  name: string;
  mood: string;
  tags: string | null;
};

export type ChatThreadRow = {
  id: string;
  summary: string | null;
  message_count: number;
  created_at: number;
  updated_at: number;
};

export async function loadCompanionForChat(
  env: Env,
  companionId: string,
): Promise<ChatCompanionRow | null> {
  return env.DB.prepare(
    `SELECT id, source, created_by, is_active,
            name, appearance, personality, background, speech_style, relationship_role
     FROM companions
     WHERE id = ?`,
  )
    .bind(companionId)
    .first<ChatCompanionRow>();
}

export function canChatWithCompanion(row: ChatCompanionRow, user: UserRecord): boolean {
  if (row.is_active === 0) return false;
  if (row.source === "official") return true;
  return row.created_by === user.id;
}

export async function loadSceneForChat(env: Env, sceneId: string): Promise<ChatSceneRow | null> {
  return env.DB.prepare(
    `SELECT id, name, mood, tags FROM scenes WHERE id = ? AND is_active = 1`,
  )
    .bind(sceneId)
    .first<ChatSceneRow>();
}

export async function loadThread(
  env: Env,
  userId: string,
  companionId: string,
): Promise<ChatThreadRow | null> {
  return env.DB.prepare(
    `SELECT id, summary, message_count, created_at, updated_at
     FROM threads
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<ChatThreadRow>();
}

export async function ensureThread(
  env: Env,
  userId: string,
  companionId: string,
  now: number,
): Promise<ChatThreadRow> {
  const existing = await loadThread(env, userId, companionId);
  if (existing) return existing;

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO threads (id, user_id, companion_id, scene_context, summary,
                          summary_until_message_id, message_count, created_at, updated_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, 0, ?, ?)`,
  )
    .bind(id, userId, companionId, now, now)
    .run();

  return {
    created_at: now,
    id,
    message_count: 0,
    summary: null,
    updated_at: now,
  };
}

export function parseSceneTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
