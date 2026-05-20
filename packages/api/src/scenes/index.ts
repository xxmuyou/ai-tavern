import { requireAuthUser } from "../auth";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import { evaluateUnlock } from "./unlock";

type SceneRow = {
  id: string;
  name: string;
  mood: string;
  tags: string | null;
  default_companions: string | null;
  unlock_condition: string | null;
  art_url: string | null;
  display_order: number;
};

type CompanionPreviewRow = {
  id: string;
  name: string;
  level_label: string | null;
};

type ScenesListItem = {
  id: string;
  name: string;
  mood: string;
  tags: string[];
  art_url: string | null;
  unlocked: boolean;
  unlock_hint: string | null;
  potential_companions: CompanionPreviewItem[];
};

type CompanionPreviewItem = {
  id: string;
  name: string;
  level: string | null;
};

type EnterSceneResponse = {
  scene: {
    id: string;
    name: string;
    mood: string;
    tags: string[];
    art_url: string | null;
  };
  companions_present: Array<{
    id: string;
    name: string;
    opener: string | null;
  }>;
  event: null;
};

export async function handleScenesRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/scenes") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }

    const user = await requireAuthUser(env, request);
    return listScenes(env, user);
  }

  const enterMatch = pathname.match(/^\/scenes\/([^/]+)\/enter$/);
  if (enterMatch) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }

    const sceneId = decodeURIComponent(enterMatch[1] ?? "");
    if (!sceneId) {
      return jsonResponse({ error: "invalid_scene_id" }, { status: 400 });
    }

    const user = await requireAuthUser(env, request);
    return enterScene(env, user, sceneId);
  }

  return null;
}

async function listScenes(env: Env, user: UserRecord): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, mood, tags, default_companions, unlock_condition, art_url, display_order
     FROM scenes
     WHERE is_active = 1
     ORDER BY display_order ASC, id ASC`,
  ).all<SceneRow>();

  const items: ScenesListItem[] = [];

  for (const row of results ?? []) {
    const { hint, unlocked } = await evaluateUnlock(env, user.id, row.unlock_condition);
    const companions = unlocked
      ? await loadPotentialCompanions(env, user.id, row.default_companions)
      : [];

    items.push({
      art_url: row.art_url,
      id: row.id,
      mood: row.mood,
      name: row.name,
      potential_companions: companions,
      tags: parseStringArray(row.tags),
      unlock_hint: hint,
      unlocked,
    });
  }

  return jsonResponse({ scenes: items });
}

async function enterScene(env: Env, user: UserRecord, sceneId: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, name, mood, tags, default_companions, unlock_condition, art_url, display_order
     FROM scenes
     WHERE id = ? AND is_active = 1`,
  )
    .bind(sceneId)
    .first<SceneRow>();

  if (!row) {
    return notFound();
  }

  const { hint, unlocked } = await evaluateUnlock(env, user.id, row.unlock_condition);
  if (!unlocked) {
    return jsonResponse(
      { error: "scene_locked", unlock_hint: hint },
      { status: 403 },
    );
  }

  const companions = await loadPotentialCompanions(env, user.id, row.default_companions);

  const body: EnterSceneResponse = {
    companions_present: companions.map(({ id, name }) => ({ id, name, opener: null })),
    event: null,
    scene: {
      art_url: row.art_url,
      id: row.id,
      mood: row.mood,
      name: row.name,
      tags: parseStringArray(row.tags),
    },
  };

  return jsonResponse(body);
}

async function loadPotentialCompanions(
  env: Env,
  userId: string,
  defaultCompanionsRaw: string | null,
): Promise<CompanionPreviewItem[]> {
  const ids = parseStringArray(defaultCompanionsRaw);
  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT c.id          AS id,
            c.name        AS name,
            r.level_label AS level_label
     FROM companions c
     LEFT JOIN relationships r
       ON r.companion_id = c.id AND r.user_id = ?
     WHERE c.id IN (${placeholders}) AND c.is_active = 1`,
  )
    .bind(userId, ...ids)
    .all<CompanionPreviewRow>();

  return (results ?? []).map((row) => ({
    id: row.id,
    level: row.level_label,
    name: row.name,
  }));
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
