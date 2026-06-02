import { requireAuthUser } from "../auth";
import {
  sampleCompanionsByPreference,
  type Gender,
  type RomancePreference,
  type WeightedCandidate,
} from "../companions/gender-weight";
import { createSceneTriggeredEvent } from "../events/create";
import { evaluateTriggersForScene } from "../events/engine";
import { pickOpener } from "../events/openers";
import type { EventResponseItem } from "../events/types";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import { loadStoryBeatForScene, type StoryBeatPublic } from "../story-beats";
import { evaluateUnlock } from "./unlock";

type SceneRow = {
  id: string;
  name: string;
  mood: string;
  tags: string | null;
  possible_events: string | null;
  default_companions: string | null;
  unlock_condition: string | null;
  art_url: string | null;
  display_order: number;
};

type CompanionPreviewRow = {
  id: string;
  name: string;
  level_label: string | null;
  gender: string | null;
  source: "official" | "user";
  art_url: string | null;
};

type ScenesListItem = {
  id: string;
  name: string;
  mood: string;
  tags: string[];
  art_url: string | null;
  unlocked: boolean;
  unlock_hint: string | null;
  potential_companions: CompanionPreviewPublic[];
};

type CompanionPreviewItem = {
  id: string;
  name: string;
  level: string | null;
  gender: Gender | null;
  source: "official" | "user";
  art_url: string | null;
};

type CompanionPreviewPublic = {
  id: string;
  name: string;
  level: string | null;
  art_url: string | null;
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
    active_story_beat: StoryBeatPublic | null;
    id: string;
    name: string;
    opener: string;
    art_url: string | null;
  }>;
  event: EventResponseItem | null;
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
    `SELECT id, name, mood, tags, possible_events, default_companions, unlock_condition, art_url, display_order
     FROM scenes
     WHERE is_active = 1
     ORDER BY display_order ASC, id ASC`,
  ).all<SceneRow>();

  const preference = await loadRomancePreference(env, user.id);
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
      potential_companions: sortByPreference(companions, preference).map(toPublicPreview),
      tags: parseStringArray(row.tags),
      unlock_hint: hint,
      unlocked,
    });
  }

  return jsonResponse({ scenes: items });
}

async function enterScene(env: Env, user: UserRecord, sceneId: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, name, mood, tags, possible_events, default_companions, unlock_condition, art_url, display_order
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
  const preference = await loadRomancePreference(env, user.id);
  const present = pickPresentCompanions(companions, preference);
  const now = Date.now();
  const companionsPresent = await Promise.all(
    present.map(async ({ id, name, art_url }) => {
      const activeStoryBeat = await loadStoryBeatForScene(env, user.id, id, row.id);
      const fallbackOpener = pickOpener({
        companionId: id,
        companionName: name,
        now,
        sceneId: row.id,
        sceneName: row.name,
        userId: user.id,
      });
      return {
        active_story_beat: activeStoryBeat,
        art_url,
        id,
        name,
        opener: activeStoryBeat?.status === "active" ? activeStoryBeat.opener : fallbackOpener,
      };
    }),
  );

  const candidate = await evaluateTriggersForScene(
    env,
    user.id,
    { id: row.id, mood: row.mood, name: row.name, possible_events: row.possible_events },
    present,
    now,
  );
  const event = candidate
    ? await createSceneTriggeredEvent(env, {
        candidate,
        now,
        scene: { id: row.id, mood: row.mood, name: row.name },
        userId: user.id,
      })
    : null;

  const body: EnterSceneResponse = {
    companions_present: companionsPresent,
    event,
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
            c.gender      AS gender,
            c.source      AS source,
            c.art_url     AS art_url,
            r.level_label AS level_label
     FROM companions c
     LEFT JOIN relationships r
       ON r.companion_id = c.id AND r.user_id = ?
     WHERE c.id IN (${placeholders}) AND c.is_active = 1`,
  )
    .bind(userId, ...ids)
    .all<CompanionPreviewRow>();

  return (results ?? []).map((row) => ({
    art_url: row.art_url,
    gender: normalizeGender(row.gender),
    id: row.id,
    level: row.level_label,
    name: row.name,
    source: row.source,
  }));
}

async function loadRomancePreference(env: Env, userId: string): Promise<RomancePreference> {
  const row = await env.DB.prepare(
    `SELECT romance_preference AS pref FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{ pref: string | null }>();
  return normalizePreference(row?.pref);
}

function pickPresentCompanions(
  candidates: CompanionPreviewItem[],
  preference: RomancePreference,
): CompanionPreviewItem[] {
  if (candidates.length === 0) return [];
  const weighted: WeightedCandidate<CompanionPreviewItem>[] = candidates.map((c) => ({
    candidate: c,
    gender: c.gender,
    source: c.source,
  }));
  return sampleCompanionsByPreference(weighted, preference);
}

function sortByPreference(
  candidates: CompanionPreviewItem[],
  preference: RomancePreference,
): CompanionPreviewItem[] {
  if (preference === "any" || candidates.length <= 1) return candidates;
  const rank = (c: CompanionPreviewItem): number => {
    if (!c.gender) return 1;
    return c.gender === preference ? 0 : 2;
  };
  return [...candidates].sort((a, b) => rank(a) - rank(b));
}

function normalizeGender(raw: string | null | undefined): Gender | null {
  return raw === "male" || raw === "female" ? raw : null;
}

function toPublicPreview(c: CompanionPreviewItem): CompanionPreviewPublic {
  return { art_url: c.art_url, id: c.id, level: c.level, name: c.name };
}

function normalizePreference(raw: string | null | undefined): RomancePreference {
  return raw === "male" || raw === "female" ? raw : "any";
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
