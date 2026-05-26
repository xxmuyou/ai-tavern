import { requireAuthUser } from "../auth";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";

import { maybeEmitAnniversaries } from "../life/anniversary";
import { applyCommittedDecayIfDue } from "./decay";
import { loadRelationship } from "./engine";
import { ZERO_DIMENSIONS, computeLevel } from "./level";
import { deriveStage } from "./stage";

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
      next_goal: stage.next_goal,
      recommended_activity: stage.recommended_activity,
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
    next_goal: stage.next_goal,
    recommended_activity: stage.recommended_activity,
    milestones: [{ at: relationship.first_met_at, type: "first_met" }],
  });
}
