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
  await env.DB.prepare(
    `INSERT OR IGNORE INTO relationships
       (user_id, companion_id,
        closeness, trust, romance, friendship,
        hostility, tension, distance,
        level_label, first_met_at, last_interaction_at)
     VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 'Stranger', ?, ?)`,
  )
    .bind(userId, companionId, now, now)
    .run();
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
