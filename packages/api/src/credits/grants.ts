import type { BillingTier } from "../billing/types";
import { grantCredits } from "./ledger";
import { MONTHLY_GRANT } from "./pricing";
import type { MonthlyGrantDto } from "./types";

/** UTC month key, e.g. "2026-05". */
export function utcMonthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

/**
 * Idempotently grants the current month's credits for the user's tier. v1 does
 * not expire grants (expires_at = null); the unique reference guarantees a
 * single grant per (user, tier, month). See spec-021 §E / §关键决策 1.
 */
export async function ensureMonthlyGrant(
  env: Env,
  userId: string,
  tier: BillingTier,
  now: number = Date.now(),
): Promise<MonthlyGrantDto> {
  const amount = MONTHLY_GRANT[tier];
  const period = utcMonthKey(now);

  await grantCredits(env, {
    amount,
    expiresAt: null,
    now,
    referenceId: `${userId}:${tier}:${period}`,
    referenceType: "monthly_grant",
    userId,
  });

  return { amount, granted: true, period, tier };
}
