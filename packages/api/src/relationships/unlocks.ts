// spec-025 Part B (S-ε): relationship unlock rules + detection.
//
// Unlocks are permanent achievements gated by the positive relationship-stage
// ladder. Reaching a stage grants every unlock at or below it; the
// relationship_unlocks table dedups so a celebration fires exactly once and the
// content stays unlocked even if the relationship later decays.
//
// Scenes are NOT handled here — they keep their existing dimension-threshold
// gating in scenes/unlock.ts. This module covers secret / title.
//
// Expressions are no longer generated or gated as separate portrait assets
// (spec-031). Chat emotion now drives UI tint/emoji only.

import type { RelationshipStage } from "../life/types";
import type { DimensionValues } from "./level";
import { deriveStage } from "./stage";

export type UnlockKind = "secret" | "expression" | "title" | "scene";

export type UnlockDef = {
  key: string; // stored in relationship_unlocks.unlock_key
  kind: UnlockKind;
  stage: RelationshipStage; // minimum positive-ladder stage required
  label: string; // celebration / profile display text
  emotion?: string; // for kind === "expression": the gated emotion key
};

// Positive ladder ranking. Negative stages (strained/hostile/estranged) are
// intentionally absent — they grant nothing.
export const STAGE_RANK: Readonly<Record<string, number>> = {
  first_contact: 0,
  familiar: 1,
  trusted: 2,
  close_friend: 3,
  romantic_tension: 4,
  dating: 5,
  committed: 6,
};

export const UNLOCK_DEFS: readonly UnlockDef[] = [
  { key: "title:familiar", kind: "title", stage: "familiar", label: "They use your name now" },
  { key: "secret", kind: "secret", stage: "trusted", label: "They trust you with something private" },
  { key: "title:close", kind: "title", stage: "close_friend", label: "A name just between you two" },
];

function rankOf(stage: string): number | null {
  const rank = STAGE_RANK[stage];
  return rank === undefined ? null : rank;
}

/** Unlock keys that should be available once the given stage is reached. */
export function unlockKeysForStage(stage: string): string[] {
  const rank = rankOf(stage);
  if (rank === null) return [];
  return UNLOCK_DEFS.filter((d) => (STAGE_RANK[d.stage] ?? Infinity) <= rank).map((d) => d.key);
}

export type UnlockEvent = { key: string; kind: UnlockKind; label: string; scene_id?: string; scene_name?: string };

const DEF_BY_KEY: ReadonlyMap<string, UnlockDef> = new Map(UNLOCK_DEFS.map((d) => [d.key, d]));

export async function loadUnlockedKeys(
  env: Env,
  userId: string,
  companionId: string,
): Promise<Set<string>> {
  const { results } = await env.DB.prepare(
    `SELECT unlock_key FROM relationship_unlocks WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .all<{ unlock_key: string }>();
  return new Set((results ?? []).map((r) => r.unlock_key));
}

export function isSecretUnlocked(unlockedKeys: ReadonlySet<string>): boolean {
  return unlockedKeys.has("secret");
}

/**
 * After dimensions move, persist the processed stage and grant any newly
 * reached stage unlocks. Returns the new stage + the unlocks granted *this
 * call* (for SSE celebration). Idempotent: re-reaching a stage grants nothing.
 */
export async function detectAndRecordUnlocks(
  env: Env,
  userId: string,
  companionId: string,
  nextDims: DimensionValues,
  now: number,
): Promise<{ stage: RelationshipStage; newlyUnlocked: UnlockEvent[] }> {
  const stage = deriveStage(nextDims).stage;

  // Record the processed stage regardless (incl. negative stages) for the
  // detector's own bookkeeping / diagnostics.
  await env.DB.prepare(
    `UPDATE relationships SET last_stage = ? WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(stage, userId, companionId)
    .run();

  const targetKeys = unlockKeysForStage(stage);
  if (targetKeys.length === 0) {
    return { stage, newlyUnlocked: [] };
  }

  const existing = await loadUnlockedKeys(env, userId, companionId);
  const newKeys = targetKeys.filter((k) => !existing.has(k));
  if (newKeys.length === 0) {
    return { stage, newlyUnlocked: [] };
  }

  const insert = env.DB.prepare(
    `INSERT OR IGNORE INTO relationship_unlocks (user_id, companion_id, unlock_key, unlocked_at)
     VALUES (?, ?, ?, ?)`,
  );
  await env.DB.batch(newKeys.map((k) => insert.bind(userId, companionId, k, now)));

  const newlyUnlocked: UnlockEvent[] = newKeys
    .map((k) => DEF_BY_KEY.get(k))
    .filter((d): d is UnlockDef => d !== undefined)
    .map((d) => ({ key: d.key, kind: d.kind, label: d.label }));

  return { stage, newlyUnlocked };
}

export type UnlockStatusItem = {
  key: string;
  kind: UnlockKind;
  label: string;
  required_stage: RelationshipStage;
  unlocked: boolean;
};

/** Full status of every stage-based unlock for the profile "unlocked" section. */
export function buildUnlockStatus(unlockedKeys: ReadonlySet<string>): UnlockStatusItem[] {
  return UNLOCK_DEFS.map((d) => ({
    key: d.key,
    kind: d.kind,
    label: d.label,
    required_stage: d.stage,
    unlocked: unlockedKeys.has(d.key),
  }));
}
