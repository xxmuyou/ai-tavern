import { requireAuthUser } from "../auth";
import { jsonResponse } from "../http";
import type { UserRecord } from "../identity";
import { ZERO_DIMENSIONS } from "../relationships";
import { deriveStage } from "../relationships/stage";

import { emitDueAnniversariesForUser } from "./anniversary";
import { getCityConfig } from "./city-config";
import { getOrComputeDailyState } from "./daily-state";
import { computeDateLocal, computeTimeSlot } from "./time-slot";
import type { TodayRecommendation, TodayResponse } from "./types";

// GET /today — the daily-life hub entry point.
//
// Returns the city banner, the user's current local date/slot, and a list of
// companion recommendations for the slot. No LLM calls, no quota deduction.
// Frontend fetches /companions/{id}/daily-state?include_flavor=1 separately
// when the user actually opens a companion card.

const MAX_RECOMMENDATIONS = 6;

type CompanionListRow = {
  id: string;
  name: string;
  art_url: string | null;
  gender: string | null;
  source: "official" | "user";
};

type RelationshipRow = {
  companion_id: string;
  closeness: number;
  trust: number;
  romance: number;
  friendship: number;
  hostility: number;
  tension: number;
  distance: number;
  last_interaction_at: number;
};

type SceneRow = {
  id: string;
  name: string;
  mood: string;
};

export async function handleTodayRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== "/today") return null;
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const user = await requireAuthUser(env, request);
  return buildTodayResponse(env, user);
}

async function buildTodayResponse(env: Env, user: UserRecord): Promise<Response> {
  const tz = await loadUserTimezone(env, user.id);
  const now = new Date();
  const dateLocal = computeDateLocal(now, tz);
  const slot = computeTimeSlot(now, tz);

  // Lazy anniversary catch-up. Cheap when none are due; bounded by the
  // number of companions the user has played with.
  try {
    await emitDueAnniversariesForUser(env, user.id);
  } catch (err) {
    console.error(JSON.stringify({ message: "anniversary_emit_failed", error: String(err) }));
  }

  const candidates = await loadCandidateCompanions(env, user.id);
  const relationships = await loadRelationshipsForUser(env, user.id);
  const relMap = new Map(relationships.map((r) => [r.companion_id, r]));

  // v1 ranking: companions with existing relationships first (by recency of
  // interaction), then fresh ones to encourage exploration. Cap at
  // MAX_RECOMMENDATIONS so the response stays cheap.
  const ranked = [...candidates].sort((a, b) => {
    const ra = relMap.get(a.id);
    const rb = relMap.get(b.id);
    if (ra && !rb) return -1;
    if (rb && !ra) return 1;
    if (ra && rb) return rb.last_interaction_at - ra.last_interaction_at;
    return a.id.localeCompare(b.id);
  });
  const selected = ranked.slice(0, MAX_RECOMMENDATIONS);

  const sceneIds = new Set<string>();
  const recommendations: TodayRecommendation[] = [];

  for (const companion of selected) {
    const state = await getOrComputeDailyState(env, companion.id, dateLocal, slot);
    if (!state) continue;
    sceneIds.add(state.scene_id);

    const rel = relMap.get(companion.id);
    const dims = rel ? {
      closeness: rel.closeness,
      trust: rel.trust,
      romance: rel.romance,
      friendship: rel.friendship,
      hostility: rel.hostility,
      tension: rel.tension,
      distance: rel.distance,
    } : { ...ZERO_DIMENSIONS };
    const stageResult = deriveStage(dims);

    recommendations.push({
      companion: {
        id: companion.id,
        name: companion.name,
        art_url: companion.art_url,
        gender: companion.gender,
      },
      scene: { id: state.scene_id, name: state.scene_id, mood: "" }, // filled below
      mood: state.mood,
      availability: state.availability,
      activity_hint: state.activity_hint,
      relationship_stage: stageResult.stage,
      stage_progress: stageResult.stage_progress,
      next_goal: stageResult.next_goal,
      suggested_activity: stageResult.recommended_activity,
    });
  }

  if (sceneIds.size > 0) {
    const scenes = await loadScenes(env, [...sceneIds]);
    const sceneMap = new Map(scenes.map((s) => [s.id, s]));
    for (const r of recommendations) {
      const s = sceneMap.get(r.scene.id);
      if (s) {
        r.scene = { id: s.id, name: s.name, mood: s.mood };
      }
    }
  }

  const body: TodayResponse = {
    city: getCityConfig(),
    date_local: dateLocal,
    time_slot: slot,
    recommendations,
  };
  return jsonResponse(body);
}

async function loadUserTimezone(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare(`SELECT timezone FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ timezone: string | null }>();
  return row?.timezone ?? "UTC";
}

async function loadCandidateCompanions(env: Env, userId: string): Promise<CompanionListRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, art_url, gender, source
     FROM companions
     WHERE is_active = 1 AND (source = 'official' OR created_by = ?)
     ORDER BY source ASC, created_at ASC`,
  )
    .bind(userId)
    .all<CompanionListRow>();
  return results ?? [];
}

async function loadRelationshipsForUser(env: Env, userId: string): Promise<RelationshipRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT companion_id, closeness, trust, romance, friendship, hostility, tension, distance,
            last_interaction_at
     FROM relationships WHERE user_id = ?`,
  )
    .bind(userId)
    .all<RelationshipRow>();
  return results ?? [];
}

async function loadScenes(env: Env, ids: string[]): Promise<SceneRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, name, mood FROM scenes WHERE id IN (${placeholders}) AND is_active = 1`,
  )
    .bind(...ids)
    .all<SceneRow>();
  return results ?? [];
}
