import { writeAnniversaryMemory } from "./memory";
import { ANNIVERSARY_MILESTONES } from "./config";

// Anniversary milestone emitter. Reads the relationship's first_met_at and
// emits one memory per (companion, milestone) the first time that
// milestone is due. Idempotent — writeAnniversaryMemory dedups by
// (user_id, companion_id, memory_type, memory_subtype).
//
// Called lazily from the /today response builder and from
// /relationships/{id}. No standalone cron is required for v1.

const DAY_MS = 24 * 60 * 60 * 1000;

type MilestoneSubtype = "30d" | "100d" | "365d";

function subtypeFor(days: number): MilestoneSubtype {
  if (days === 30) return "30d";
  if (days === 100) return "100d";
  return "365d";
}

function summaryFor(days: number): string {
  if (days === 30) return "Thirty days in. Still here, still trying.";
  if (days === 100) return "A hundred days of each other. Things have changed, in good ways.";
  return "A whole year. Hard to picture the version of us who hadn't met yet.";
}

export async function maybeEmitAnniversaries(
  env: Env,
  userId: string,
  companionId: string,
  firstMetAt: number,
  nowMs: number = Date.now(),
): Promise<void> {
  const elapsedDays = Math.floor((nowMs - firstMetAt) / DAY_MS);
  for (const milestone of ANNIVERSARY_MILESTONES) {
    if (elapsedDays >= milestone) {
      await writeAnniversaryMemory(env, {
        user_id: userId,
        companion_id: companionId,
        subtype: subtypeFor(milestone),
        summary: summaryFor(milestone),
      });
    }
  }
}

// Batch helper: scan all of the user's relationships and emit any anniversary
// milestones that are now due. Used by /today.
export async function emitDueAnniversariesForUser(env: Env, userId: string): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT companion_id, first_met_at FROM relationships WHERE user_id = ?`,
  )
    .bind(userId)
    .all<{ companion_id: string; first_met_at: number }>();
  const now = Date.now();
  for (const row of results ?? []) {
    await maybeEmitAnniversaries(env, userId, row.companion_id, row.first_met_at, now);
  }
}
