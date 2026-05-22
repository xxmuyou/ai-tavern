import {
  checkMessageQuota,
  checkRateLimit,
  incrementMessageQuota,
  messageQuotaKey,
  minuteKey,
  QUOTA_LIMITS,
} from "../billing/quota";
import { isProUser } from "../billing/entitlements";
import type { BillingTier } from "../billing/types";

export type QuotaCheck = { ok: true; remaining: number | null } | { ok: false; reason: "quota_exceeded" };
export type RateCheck = { ok: true } | { ok: false; reason: "rate_limited" };

export function dailyKey(userId: string, now: number, subscriber: boolean): string {
  return messageQuotaKey(userId, now);
}

export { minuteKey };

export async function isSubscriberActive(env: Env, userId: string, now: number): Promise<boolean> {
  return isProUser(env, userId, now);
}

export { checkRateLimit };

export async function checkQuota(
  env: Env,
  userId: string,
  now: number,
  subscriber: boolean,
): Promise<QuotaCheck> {
  return checkMessageQuota(env, userId, now, tierFromSubscriber(subscriber));
}

export async function incrementQuota(
  env: Env,
  userId: string,
  now: number,
  subscriber: boolean,
): Promise<void> {
  await incrementMessageQuota(env, userId, now);
}

function tierFromSubscriber(subscriber: boolean): BillingTier {
  return subscriber ? "pro" : "free";
}

export { QUOTA_LIMITS };
