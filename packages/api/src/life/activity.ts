import { requireAuthUser } from "../auth";
import { jsonResponse, notFound, readJson } from "../http";
import type { UserRecord } from "../identity";
import { ZERO_DIMENSIONS } from "../relationships";

import { getOrComputeDailyState } from "./daily-state";
import { computeDateLocal, computeTimeSlot } from "./time-slot";
import { ACTIVITY_THRESHOLDS, GIFT_COOLDOWN_MS } from "./config";
import { onActivityCompleted } from "./memory-hooks";
import type {
  ActivityRecord,
  ActivityStatus,
  ActivityType,
  Availability,
  Mood,
} from "./types";
import { ACTIVITY_TYPES, ACTIVITY_STATUSES } from "./types";

// POST   /activities                     -> create
// POST   /activities/{id}/complete       -> mark completed; triggers memory hook
// POST   /activities/{id}/cancel         -> mark canceled
//
// daily_state_snapshot stored at creation so the chat / completion path sees
// stable context even if the slot rolls over mid-session.

type RelationshipRow = {
  closeness: number;
  trust: number;
  romance: number;
  friendship: number;
  hostility: number;
  tension: number;
  distance: number;
  last_interaction_at: number;
};

type ActivityRow = {
  id: string;
  user_id: string;
  companion_id: string;
  scene_id: string;
  activity_type: string;
  status: string;
  daily_state_snapshot: string;
  started_at: number;
  completed_at: number | null;
  canceled_at: number | null;
};

export async function handleActivityRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/activities") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    const body = await readJson<unknown>(request);
    return createActivity(env, user, body);
  }

  const completeMatch = pathname.match(/^\/activities\/([^/]+)\/complete$/);
  if (completeMatch) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const id = decodeURIComponent(completeMatch[1] ?? "");
    if (!id) return jsonResponse({ error: "invalid_activity_id" }, { status: 400 });
    const user = await requireAuthUser(env, request);
    return completeActivity(env, user, id);
  }

  const cancelMatch = pathname.match(/^\/activities\/([^/]+)\/cancel$/);
  if (cancelMatch) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const id = decodeURIComponent(cancelMatch[1] ?? "");
    if (!id) return jsonResponse({ error: "invalid_activity_id" }, { status: 400 });
    const user = await requireAuthUser(env, request);
    return cancelActivity(env, user, id);
  }

  return null;
}

// -----------------------------------------------------------------------------
// Handlers
// -----------------------------------------------------------------------------

async function createActivity(env: Env, user: UserRecord, raw: unknown): Promise<Response> {
  if (!raw || typeof raw !== "object") {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }
  const obj = raw as Record<string, unknown>;
  const companionId = typeof obj.companion_id === "string" ? obj.companion_id : null;
  const sceneId = typeof obj.scene_id === "string" ? obj.scene_id : null;
  const activityType = obj.activity_type;
  if (!companionId || !sceneId || typeof activityType !== "string") {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }
  if (!(ACTIVITY_TYPES as readonly string[]).includes(activityType)) {
    return jsonResponse({ error: "invalid_activity_type" }, { status: 400 });
  }
  const at = activityType as ActivityType;

  const companion = await loadCompanion(env, companionId);
  if (!companion || (companion.source === "user" && companion.created_by !== user.id)) {
    return notFound();
  }

  const tz = await loadUserTimezone(env, user.id);
  const now = new Date();
  const dateLocal = computeDateLocal(now, tz);
  const slot = computeTimeSlot(now, tz);
  const state = await getOrComputeDailyState(env, companionId, dateLocal, slot);
  if (!state) return notFound();

  const relationship = await loadRelationship(env, user.id, companionId);

  // The activity's scene must match where the companion actually is right
  // now. Frontend should pass the scene_id it saw in /today; if it diverges
  // we reject so the chat scene stays consistent.
  if (sceneId !== state.scene_id) {
    return jsonResponse(
      { error: "activity_unavailable", reason: "wrong_scene", expected_scene: state.scene_id },
      { status: 422 },
    );
  }

  const gate = await checkActivityGate(env, user.id, companionId, at, state.availability, state.mood, relationship);
  if (!gate.ok) {
    return jsonResponse({ error: "activity_unavailable", reason: gate.reason }, { status: 422 });
  }

  const id = crypto.randomUUID();
  const snapshot = {
    mood: state.mood,
    availability: state.availability,
    activity_hint: state.activity_hint,
    scene_id: state.scene_id,
  };
  const nowMs = Date.now();
  await env.DB.prepare(
    `INSERT INTO activity_contexts
       (id, user_id, companion_id, scene_id, activity_type, status,
        daily_state_snapshot, started_at, completed_at, canceled_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, NULL, NULL)`,
  )
    .bind(id, user.id, companionId, sceneId, at, JSON.stringify(snapshot), nowMs)
    .run();

  return serializeActivity(
    {
      id,
      user_id: user.id,
      companion_id: companionId,
      scene_id: sceneId,
      activity_type: at,
      status: "active",
      daily_state_snapshot: JSON.stringify(snapshot),
      started_at: nowMs,
      completed_at: null,
      canceled_at: null,
    },
    { status: 201 },
  );
}

async function completeActivity(env: Env, user: UserRecord, id: string): Promise<Response> {
  const row = await loadActivity(env, id);
  if (!row || row.user_id !== user.id) return notFound();
  if (row.status !== "active") {
    return jsonResponse({ error: "invalid_status", current: row.status }, { status: 409 });
  }
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE activity_contexts SET status = 'completed', completed_at = ? WHERE id = ?`,
  )
    .bind(now, id)
    .run();

  // Memory hook fires post-update so even if it errors we don't roll back.
  try {
    await onActivityCompleted(env, {
      id: row.id,
      user_id: row.user_id,
      companion_id: row.companion_id,
      scene_id: row.scene_id,
      activity_type: row.activity_type as ActivityType,
      completed_at: now,
      daily_state_snapshot: row.daily_state_snapshot,
    });
  } catch (err) {
    console.error(JSON.stringify({ message: "memory_hook_failed", id, error: String(err) }));
  }

  return serializeActivity({ ...row, status: "completed", completed_at: now });
}

async function cancelActivity(env: Env, user: UserRecord, id: string): Promise<Response> {
  const row = await loadActivity(env, id);
  if (!row || row.user_id !== user.id) return notFound();
  if (row.status !== "active") {
    return jsonResponse({ error: "invalid_status", current: row.status }, { status: 409 });
  }
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE activity_contexts SET status = 'canceled', canceled_at = ? WHERE id = ?`,
  )
    .bind(now, id)
    .run();

  return serializeActivity({ ...row, status: "canceled", canceled_at: now });
}

// -----------------------------------------------------------------------------
// Conditions
// -----------------------------------------------------------------------------

type GateResult = { ok: true } | { ok: false; reason: string };

async function checkActivityGate(
  env: Env,
  userId: string,
  companionId: string,
  at: ActivityType,
  availability: Availability,
  _mood: Mood,
  relationship: RelationshipRow | null,
): Promise<GateResult> {
  const dims = relationship ?? { ...ZERO_DIMENSIONS, last_interaction_at: 0 };

  switch (at) {
    case "check_in":
      // Always allowed — even busy / away companions accept a wave.
      return { ok: true };

    case "hang_out":
      if (availability !== "available") return { ok: false, reason: "companion_busy" };
      if (dims.closeness < ACTIVITY_THRESHOLDS.hang_out_min_closeness) {
        return { ok: false, reason: "stage_too_low" };
      }
      return { ok: true };

    case "invite":
      if (availability === "away") return { ok: false, reason: "companion_away" };
      if (
        dims.closeness < ACTIVITY_THRESHOLDS.invite_min_closeness
        && dims.trust < ACTIVITY_THRESHOLDS.invite_min_trust
      ) {
        return { ok: false, reason: "stage_too_low" };
      }
      return { ok: true };

    case "date":
      if (availability !== "available") return { ok: false, reason: "companion_busy" };
      if (dims.romance < ACTIVITY_THRESHOLDS.date_min_romance) {
        return { ok: false, reason: "romance_too_low" };
      }
      if (dims.tension > ACTIVITY_THRESHOLDS.date_max_tension) {
        return { ok: false, reason: "too_tense" };
      }
      if (dims.hostility > ACTIVITY_THRESHOLDS.date_max_hostility) {
        return { ok: false, reason: "too_hostile" };
      }
      if (dims.distance > ACTIVITY_THRESHOLDS.date_max_distance) {
        return { ok: false, reason: "too_distant" };
      }
      return { ok: true };

    case "gift": {
      if (availability === "away") return { ok: false, reason: "companion_away" };
      const lastGift = await loadMostRecentGift(env, userId, companionId);
      if (lastGift && Date.now() - lastGift < GIFT_COOLDOWN_MS) {
        return { ok: false, reason: "gift_on_cooldown" };
      }
      return { ok: true };
    }

    case "repair": {
      const needs = Math.max(dims.tension, dims.hostility, dims.distance);
      if (needs < ACTIVITY_THRESHOLDS.repair_min_negative) {
        return { ok: false, reason: "nothing_to_repair" };
      }
      return { ok: true };
    }
  }
}

// -----------------------------------------------------------------------------
// DB helpers
// -----------------------------------------------------------------------------

async function loadCompanion(
  env: Env,
  companionId: string,
): Promise<{ id: string; source: "official" | "user"; created_by: string | null; name: string } | null> {
  return env.DB.prepare(
    `SELECT id, source, created_by, name FROM companions WHERE id = ? AND is_active = 1`,
  )
    .bind(companionId)
    .first();
}

async function loadRelationship(
  env: Env,
  userId: string,
  companionId: string,
): Promise<RelationshipRow | null> {
  return env.DB.prepare(
    `SELECT closeness, trust, romance, friendship, hostility, tension, distance, last_interaction_at
     FROM relationships WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<RelationshipRow>();
}

async function loadActivity(env: Env, id: string): Promise<ActivityRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, companion_id, scene_id, activity_type, status,
            daily_state_snapshot, started_at, completed_at, canceled_at
     FROM activity_contexts WHERE id = ?`,
  )
    .bind(id)
    .first<ActivityRow>();
}

async function loadMostRecentGift(env: Env, userId: string, companionId: string): Promise<number | null> {
  const row = await env.DB.prepare(
    `SELECT started_at FROM activity_contexts
     WHERE user_id = ? AND companion_id = ? AND activity_type = 'gift'
     ORDER BY started_at DESC LIMIT 1`,
  )
    .bind(userId, companionId)
    .first<{ started_at: number }>();
  return row?.started_at ?? null;
}

async function loadUserTimezone(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare(`SELECT timezone FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ timezone: string | null }>();
  return row?.timezone ?? "UTC";
}

// -----------------------------------------------------------------------------
// Public helpers (used by chat to inject activity context)
// -----------------------------------------------------------------------------

export async function loadActiveActivityForChat(
  env: Env,
  userId: string,
  activityId: string,
): Promise<ActivityRecord | null> {
  const row = await loadActivity(env, activityId);
  if (!row || row.user_id !== userId) return null;
  if (row.status !== "active") return null;
  return serializeActivityRecord(row);
}

function serializeActivity(row: ActivityRow, init?: ResponseInit): Response {
  return jsonResponse(serializeActivityRecord(row), init);
}

function serializeActivityRecord(row: ActivityRow): ActivityRecord {
  let snapshot: ActivityRecord["daily_state_snapshot"];
  try {
    snapshot = JSON.parse(row.daily_state_snapshot) as ActivityRecord["daily_state_snapshot"];
  } catch {
    snapshot = { mood: "calm", availability: "available", activity_hint: "", scene_id: row.scene_id };
  }
  return {
    id: row.id,
    user_id: row.user_id,
    companion_id: row.companion_id,
    scene_id: row.scene_id,
    activity_type: row.activity_type as ActivityType,
    status: row.status as ActivityStatus,
    daily_state_snapshot: snapshot,
    started_at: row.started_at,
    completed_at: row.completed_at,
    canceled_at: row.canceled_at,
  };
}

// Make sure callers see the enum sanity (avoids unused-import warnings).
void ACTIVITY_STATUSES;
