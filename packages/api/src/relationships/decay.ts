import { COMMITTED_DECAY } from "../life/config";
import { clampDimension } from "./level";
import { deriveStage } from "./stage";

// Committed-stage decay. Runs lazily on relationship read paths (currently
// /relationships/{id}). The rule:
//   - Only fires when the *current* stage derived from the row is `committed`.
//   - Only fires when (now - last_interaction_at) > COMMITTED_DECAY.threshold_ms.
//   - Decrements romance/trust/closeness proportional to days idle past the
//     threshold. We rebase `last_interaction_at` to `now - threshold` so we
//     don't double-apply on the next read.

type DecayRow = {
  closeness: number;
  trust: number;
  romance: number;
  friendship: number;
  hostility: number;
  tension: number;
  distance: number;
  last_interaction_at: number;
};

export type DecayResult = { applied: false } | { applied: true; days_decayed: number };

export async function applyCommittedDecayIfDue(
  env: Env,
  userId: string,
  companionId: string,
  nowMs: number = Date.now(),
): Promise<DecayResult> {
  const row = await env.DB.prepare(
    `SELECT closeness, trust, romance, friendship, hostility, tension, distance, last_interaction_at
     FROM relationships
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<DecayRow>();

  if (!row) return { applied: false };

  const dims = {
    closeness: row.closeness,
    distance: row.distance,
    friendship: row.friendship,
    hostility: row.hostility,
    romance: row.romance,
    tension: row.tension,
    trust: row.trust,
  };
  const { stage } = deriveStage(dims);
  if (stage !== "committed") return { applied: false };

  const idleMs = nowMs - row.last_interaction_at;
  if (idleMs <= COMMITTED_DECAY.threshold_ms) return { applied: false };

  // How many full days past the threshold have elapsed?
  const excessMs = idleMs - COMMITTED_DECAY.threshold_ms;
  const daysDecayed = Math.floor(excessMs / (24 * 60 * 60 * 1000));
  if (daysDecayed <= 0) return { applied: false };

  const newRomance = clampDimension(row.romance - daysDecayed * COMMITTED_DECAY.romance_per_day);
  const newTrust = clampDimension(row.trust - daysDecayed * COMMITTED_DECAY.trust_per_day);
  const newCloseness = clampDimension(
    row.closeness - daysDecayed * COMMITTED_DECAY.closeness_per_day,
  );

  // Rebase the timestamp so subsequent reads only see *new* idle days. We
  // intentionally do NOT touch last_interaction_at when reset to "now" — that
  // would hide the user's continued absence; instead push it forward by the
  // chunk we've already applied.
  const newLastInteractionAt = row.last_interaction_at + daysDecayed * 24 * 60 * 60 * 1000;

  await env.DB.prepare(
    `UPDATE relationships
     SET closeness = ?, trust = ?, romance = ?, last_interaction_at = ?
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(newCloseness, newTrust, newRomance, newLastInteractionAt, userId, companionId)
    .run();

  return { applied: true, days_decayed: daysDecayed };
}
