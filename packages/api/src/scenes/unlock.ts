// Unlock-condition evaluation for scenes.
//
// v1 supports only the 'min_relationship' condition shape; richer rules
// (time-based, accumulated events, etc.) land with spec-008.

export type SingularityDim =
  | "closeness"
  | "trust"
  | "romance"
  | "friendship"
  | "hostility"
  | "tension"
  | "distance";

export type UnlockCondition =
  | { type: "min_relationship"; companion_id: string; dim: SingularityDim; value: number }
  | null;

export type UnlockResult = {
  unlocked: boolean;
  hint: string | null;
};

export type SceneUnlockInput = {
  id: string;
  unlock_condition: string | null | undefined;
};

const ALL_DIMS: ReadonlySet<SingularityDim> = new Set([
  "closeness",
  "trust",
  "romance",
  "friendship",
  "hostility",
  "tension",
  "distance",
]);

export function parseUnlockCondition(raw: string | null | undefined): UnlockCondition {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { type?: unknown; companion_id?: unknown; dim?: unknown; value?: unknown };
    if (parsed.type !== "min_relationship") {
      return null;
    }

    if (typeof parsed.companion_id !== "string" || typeof parsed.value !== "number") {
      return null;
    }

    if (typeof parsed.dim !== "string" || !ALL_DIMS.has(parsed.dim as SingularityDim)) {
      return null;
    }

    return {
      companion_id: parsed.companion_id,
      dim: parsed.dim as SingularityDim,
      type: "min_relationship",
      value: parsed.value,
    };
  } catch {
    return null;
  }
}

export async function evaluateUnlock(
  env: Env,
  userId: string,
  raw: string | null | undefined,
  companionIdOverride?: string | null,
): Promise<UnlockResult> {
  const condition = parseUnlockCondition(raw);
  if (!condition) {
    return { unlocked: true, hint: null };
  }

  const companionId = companionIdOverride || condition.companion_id;
  const row = await env.DB.prepare(
    `SELECT closeness, trust, romance, friendship, hostility, tension, distance
     FROM relationships
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<Record<SingularityDim, number>>();

  const current = row?.[condition.dim] ?? 0;
  const unlocked = current >= condition.value;
  if (unlocked) {
    return { unlocked: true, hint: null };
  }

  return {
    hint: companionIdOverride
      ? `Reach ${condition.dim} ${condition.value} with this companion to unlock this place.`
      : `Reach ${condition.dim} ${condition.value} with the right person to unlock this place.`,
    unlocked: false,
  };
}

type UserSceneUnlockRow = {
  one: number;
};

type RelationshipDimensionRow = Record<SingularityDim, number> & {
  companion_id: string;
};

export async function recordUserSceneUnlock(
  env: Env,
  args: {
    userId: string;
    sceneId: string;
    unlockedAt: number;
    sourceCompanionId?: string | null;
  },
): Promise<boolean> {
  const existing = await env.DB.prepare(
    `SELECT 1 AS one FROM user_scene_unlocks WHERE user_id = ? AND scene_id = ?`,
  )
    .bind(args.userId, args.sceneId)
    .first<UserSceneUnlockRow>();
  if (existing) {
    return false;
  }

  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO user_scene_unlocks (user_id, scene_id, unlocked_at, source_companion_id)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(args.userId, args.sceneId, args.unlockedAt, args.sourceCompanionId ?? null)
    .run();
  const changes = (result as { meta?: { changes?: number } } | undefined)?.meta?.changes;
  return changes === undefined ? true : changes > 0;
}

export async function evaluateUserSceneUnlock(
  env: Env,
  userId: string,
  scene: SceneUnlockInput,
  now = Date.now(),
): Promise<UnlockResult> {
  const condition = parseUnlockCondition(scene.unlock_condition);
  if (!condition) {
    return { hint: null, unlocked: true };
  }

  const existing = await env.DB.prepare(
    `SELECT 1 AS one FROM user_scene_unlocks WHERE user_id = ? AND scene_id = ?`,
  )
    .bind(userId, scene.id)
    .first<UserSceneUnlockRow>();
  if (existing) {
    return { hint: null, unlocked: true };
  }

  const { results } = await env.DB.prepare(
    `SELECT companion_id, closeness, trust, romance, friendship, hostility, tension, distance
     FROM relationships
     WHERE user_id = ?`,
  )
    .bind(userId)
    .all<RelationshipDimensionRow>();

  const source = (results ?? []).find((row) => (row[condition.dim] ?? 0) >= condition.value);
  if (source) {
    await recordUserSceneUnlock(env, {
      sceneId: scene.id,
      sourceCompanionId: source.companion_id,
      unlockedAt: now,
      userId,
    });
    return { hint: null, unlocked: true };
  }

  return {
    hint: `Reach ${condition.dim} ${condition.value} with any companion to unlock this place.`,
    unlocked: false,
  };
}
