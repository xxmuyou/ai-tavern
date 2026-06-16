import type { UserRecord } from "../identity";

export type ChatCompanionRow = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
  name: string;
  gender: string | null;
  voice_id: string | null;
  voice_speed: string | null;
  appearance: string | null;
  personality: string | null;
  background: string | null;
  speech_style: string | null;
  relationship_role: string | null;
  preferred_scenes: string | null;
  want: string | null;
  secret: string | null;
  boundary: string | null;
  greeting: string | null;
  example_dialogues: string | null;
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
  persona_id: string | null;
  created_at: number;
  updated_at: number;
};

export async function loadCompanionForChat(
  env: Env,
  companionId: string,
): Promise<ChatCompanionRow | null> {
  return env.DB.prepare(
    `SELECT id, source, created_by, is_active,
            name, gender, voice_id, voice_speed, appearance, personality, background, speech_style, relationship_role,
            preferred_scenes, want, secret, boundary, greeting, example_dialogues
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
    `SELECT id, summary, message_count, persona_id, created_at, updated_at
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
                          summary_until_message_id, message_count, persona_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, 0, NULL, ?, ?)`,
  )
    .bind(id, userId, companionId, now, now)
    .run();

  // A brand-new thread means this user just started chatting with the companion
  // for the first time — bump its play count for the "popular" discovery sort.
  await env.DB.prepare(`UPDATE companions SET play_count = play_count + 1 WHERE id = ?`)
    .bind(companionId)
    .run();

  return {
    created_at: now,
    id,
    message_count: 0,
    persona_id: null,
    summary: null,
    updated_at: now,
  };
}

export function parseSceneTags(raw: string | null): string[] {
  return parseStringArray(raw);
}

export function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Parse the companion's example-dialogue JSON (array of voice sample lines). */
export function parseExampleDialogues(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}
