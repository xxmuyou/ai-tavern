import {
  ALL_DIMENSIONS,
  type Dimension,
  type DimensionValues,
  type RelationshipLevel,
  ZERO_DIMENSIONS,
  clampDimension,
  clampSignal,
  computeLevel,
} from "./level";
import { resolveSeedDimensions } from "./seed";
import { deriveStage } from "./stage";
import { unlockKeysForStage } from "./unlocks";

export type Signals = Partial<DimensionValues>;

export type RelationshipState = {
  dimensions: DimensionValues;
  level: RelationshipLevel;
  first_met_at: number;
  last_interaction_at: number;
};

type RelationshipRow = DimensionValues & {
  level_label: string | null;
  first_met_at: number;
  last_interaction_at: number;
};

export async function ensureRelationship(
  env: Env,
  userId: string,
  companionId: string,
  now: number,
): Promise<void> {
  // Fast path: row already exists — nothing to seed (and we avoid the extra
  // companion lookup on the hot path).
  const existing = await env.DB.prepare(
    `SELECT 1 AS one FROM relationships WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<{ one: number }>();
  if (existing) return;

  // First contact: seed from the precedence chain
  // companion.initial_dims -> relationship_role default -> zeros.
  const companion = await env.DB.prepare(
    `SELECT relationship_role, initial_dims FROM companions WHERE id = ?`,
  )
    .bind(companionId)
    .first<{ relationship_role: string | null; initial_dims: string | null }>();

  const dims = resolveSeedDimensions(
    companion?.initial_dims ?? null,
    companion?.relationship_role ?? null,
  );
  const level = computeLevel(dims);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO relationships
       (user_id, companion_id,
        closeness, trust, romance, friendship,
        hostility, tension, distance,
        level_label, first_met_at, last_interaction_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      userId,
      companionId,
      dims.closeness,
      dims.trust,
      dims.romance,
      dims.friendship,
      dims.hostility,
      dims.tension,
      dims.distance,
      level,
      now,
      now,
    )
    .run();

  // Silently pre-grant any milestone already satisfied by the seeded stage, so a
  // seeded relationship is internally consistent and the user is not hit with a
  // turn-1 celebration for something that was true from the very start. No SSE.
  const seededStage = deriveStage(dims).stage;
  const seededUnlocks = unlockKeysForStage(seededStage);
  if (seededUnlocks.length > 0) {
    const insert = env.DB.prepare(
      `INSERT OR IGNORE INTO relationship_unlocks (user_id, companion_id, unlock_key, unlocked_at)
       VALUES (?, ?, ?, ?)`,
    );
    await env.DB.batch(seededUnlocks.map((key) => insert.bind(userId, companionId, key, now)));
  }
}

export async function loadRelationship(
  env: Env,
  userId: string,
  companionId: string,
): Promise<RelationshipState | null> {
  const row = await env.DB.prepare(
    `SELECT closeness, trust, romance, friendship, hostility, tension, distance,
            level_label, first_met_at, last_interaction_at
     FROM relationships
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<RelationshipRow>();

  if (!row) return null;

  const dimensions = extractDimensions(row);
  return {
    dimensions,
    first_met_at: row.first_met_at,
    last_interaction_at: row.last_interaction_at,
    // Always recompute level from current dimensions so DB drift can't lie to clients.
    level: computeLevel(dimensions),
  };
}

export async function applySignals(
  env: Env,
  userId: string,
  companionId: string,
  signals: Signals,
  now: number,
): Promise<RelationshipState> {
  await ensureRelationship(env, userId, companionId, now);

  const row = await env.DB.prepare(
    `SELECT closeness, trust, romance, friendship, hostility, tension, distance,
            first_met_at
     FROM relationships
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<DimensionValues & { first_met_at: number }>();

  if (!row) {
    // Shouldn't happen since ensureRelationship just ran, but guard anyway.
    throw new Error("relationship row missing after ensureRelationship");
  }

  const current = extractDimensions(row);
  const next: DimensionValues = { ...ZERO_DIMENSIONS };
  for (const dim of ALL_DIMENSIONS) {
    const delta = signals[dim];
    const safeDelta = typeof delta === "number" && Number.isFinite(delta) ? clampSignal(delta) : 0;
    next[dim] = clampDimension(current[dim] + safeDelta);
  }

  const level = computeLevel(next);

  await env.DB.prepare(
    `UPDATE relationships
     SET closeness = ?, trust = ?, romance = ?, friendship = ?,
         hostility = ?, tension = ?, distance = ?,
         level_label = ?, last_interaction_at = ?
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(
      next.closeness,
      next.trust,
      next.romance,
      next.friendship,
      next.hostility,
      next.tension,
      next.distance,
      level,
      now,
      userId,
      companionId,
    )
    .run();

  return {
    dimensions: next,
    first_met_at: row.first_met_at,
    last_interaction_at: now,
    level,
  };
}

function extractDimensions(row: DimensionValues): DimensionValues {
  const out: DimensionValues = { ...ZERO_DIMENSIONS };
  for (const dim of ALL_DIMENSIONS) {
    const value = row[dim];
    out[dim] = typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  return out;
}

export type { Dimension, DimensionValues, RelationshipLevel };
