import { requireAuthUser } from "../auth";
import { isProUser } from "../billing/entitlements";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";

import { maybeEmitAnniversaries } from "../life/anniversary";
import { evaluateUnlock, parseUnlockCondition } from "../scenes/unlock";
import { applyCommittedDecayIfDue } from "./decay";
import { loadRelationship } from "./engine";
import { ZERO_DIMENSIONS, computeLevel } from "./level";
import { deriveStage } from "./stage";
import {
  buildUnlockStatus,
  isSecretUnlocked,
  loadUnlockedKeys,
} from "./unlocks";

export { applySignals, ensureRelationship, loadRelationship } from "./engine";
export {
  ALL_DIMENSIONS,
  ZERO_DIMENSIONS,
  clampDimension,
  clampSignal,
  computeLevel,
} from "./level";
export type { Dimension, DimensionValues, RelationshipLevel } from "./level";
export type { RelationshipState, Signals } from "./engine";

type CompanionVisibilityRow = {
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
};

export async function handleRelationshipsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const unlocksMatch = pathname.match(/^\/relationships\/([^/]+)\/unlocks$/);
  if (unlocksMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const companionId = decodeURIComponent(unlocksMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    return getRelationshipUnlocks(env, user, companionId);
  }

  const match = pathname.match(/^\/relationships\/([^/]+)$/);
  if (!match) {
    return null;
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const companionId = decodeURIComponent(match[1] ?? "");
  if (!companionId) {
    return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
  }

  const user = await requireAuthUser(env, request);
  return getRelationship(env, user, companionId);
}

type SceneUnlockStatus = { id: string; name: string; unlocked: boolean; hint: string | null };

async function loadCompanionSceneUnlocks(
  env: Env,
  userId: string,
  companionId: string,
): Promise<SceneUnlockStatus[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, unlock_condition FROM scenes
     WHERE is_active = 1 AND unlock_condition IS NOT NULL
     ORDER BY display_order ASC`,
  ).all<{ id: string; name: string; unlock_condition: string | null }>();

  const out: SceneUnlockStatus[] = [];
  for (const row of results ?? []) {
    const condition = parseUnlockCondition(row.unlock_condition);
    if (!condition || condition.companion_id !== companionId) {
      continue;
    }
    const res = await evaluateUnlock(env, userId, row.unlock_condition);
    out.push({ hint: res.hint, id: row.id, name: row.name, unlocked: res.unlocked });
  }
  return out;
}

async function getRelationshipUnlocks(
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<Response> {
  const companion = await env.DB.prepare(
    `SELECT source, created_by, is_active, secret FROM companions WHERE id = ?`,
  )
    .bind(companionId)
    .first<CompanionVisibilityRow & { secret: string | null }>();

  if (!companion || companion.is_active === 0) {
    return notFound();
  }
  if (companion.source === "user" && companion.created_by !== user.id) {
    return notFound();
  }

  const relationship = await loadRelationship(env, user.id, companionId);
  const dimensions = relationship?.dimensions ?? { ...ZERO_DIMENSIONS };
  const stage = deriveStage(dimensions).stage;

  const unlockedKeys = await loadUnlockedKeys(env, user.id, companionId);
  const items = buildUnlockStatus(unlockedKeys);
  const secretUnlocked = isSecretUnlocked(unlockedKeys);

  const isOwner = companion.source === "user" && companion.created_by === user.id;
  const pro = await isProUser(env, user.id);
  // §B5: viewing unlocked content is a Pro entitlement; the owner of a
  // user-created companion always sees their own secret. Free users see that
  // the secret is unlocked but not its text.
  const canViewSecret = secretUnlocked && (isOwner || pro);
  const scenes = await loadCompanionSceneUnlocks(env, user.id, companionId);

  return jsonResponse({
    companion_id: companionId,
    is_owner: isOwner,
    is_pro: pro,
    items,
    scenes,
    secret: canViewSecret ? companion.secret : null,
    secret_unlocked: secretUnlocked,
    stage,
  });
}

async function getRelationship(env: Env, user: UserRecord, companionId: string): Promise<Response> {
  const companion = await env.DB.prepare(
    `SELECT source, created_by, is_active FROM companions WHERE id = ?`,
  )
    .bind(companionId)
    .first<CompanionVisibilityRow>();

  if (!companion || companion.is_active === 0) {
    return notFound();
  }

  // User-created companions are private to the owner.
  if (companion.source === "user" && companion.created_by !== user.id) {
    return notFound();
  }

  // Apply committed-stage decay lazily on read. Cheap no-op for everyone
  // who is not in committed + idle longer than the threshold.
  await applyCommittedDecayIfDue(env, user.id, companionId);
  const relationship = await loadRelationship(env, user.id, companionId);

  if (!relationship) {
    const stage = deriveStage(ZERO_DIMENSIONS);
    return jsonResponse({
      companion_id: companionId,
      dimensions: { ...ZERO_DIMENSIONS },
      first_met_at: null,
      last_interaction_at: null,
      level: computeLevel(ZERO_DIMENSIONS),
      stage: stage.stage,
      stage_progress: stage.stage_progress,
      next_goal: stage.next_goal?.description ?? null,
      recommended_activity: stage.recommended_activity?.activity_type ?? null,
      milestones: [],
    });
  }

  // Lazy anniversary emit for this companion. Skipped silently on error.
  try {
    await maybeEmitAnniversaries(env, user.id, companionId, relationship.first_met_at);
  } catch {
    // Don't block the relationship payload if memory writes fail.
  }

  const stage = deriveStage(relationship.dimensions);
  return jsonResponse({
    companion_id: companionId,
    dimensions: relationship.dimensions,
    first_met_at: relationship.first_met_at,
    last_interaction_at: relationship.last_interaction_at,
    level: relationship.level,
    stage: stage.stage,
    stage_progress: stage.stage_progress,
    next_goal: stage.next_goal?.description ?? null,
    recommended_activity: stage.recommended_activity?.activity_type ?? null,
    milestones: [{ at: relationship.first_met_at, type: "first_met" }],
  });
}
