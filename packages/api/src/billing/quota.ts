import type { BillingTier, EntitlementsDto, UsageDto } from "./types";

export const FREE_DAILY_MESSAGE_LIMIT = 30;
export const FREE_CUSTOM_COMPANION_LIMIT = 3;
export const SUBSCRIBER_DAILY_SOFT_MESSAGE_THRESHOLD = 1000;
export const MESSAGE_QUOTA_TTL_SECONDS = 90_000;
export const RATE_LIMIT_PER_MINUTE = 10;
export const RATE_LIMIT_TTL_SECONDS = 120;

export type QuotaCheck = { ok: true; remaining: number | null } | { ok: false; reason: "quota_exceeded" };
export type RateCheck = { ok: true } | { ok: false; reason: "rate_limited" };

export function messageQuotaKey(userId: string, now: number): string {
  return `quota:${userId}:${formatDateUtc(now)}:messages`;
}

export function minuteKey(userId: string, now: number): string {
  return `ratelimit:${userId}:${formatMinuteUtc(now)}`;
}

export async function checkRateLimit(env: Env, userId: string, now: number): Promise<RateCheck> {
  const key = minuteKey(userId, now);
  const current = parseCount(await env.CONFIG.get(key));
  if (current >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, reason: "rate_limited" };
  }
  await env.CONFIG.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_TTL_SECONDS });
  return { ok: true };
}

export async function checkMessageQuota(
  env: Env,
  userId: string,
  now: number,
  tier: BillingTier,
): Promise<QuotaCheck> {
  if (tier === "pro") {
    return { ok: true, remaining: null };
  }

  const used = await getMessagesUsedToday(env, userId, now);
  if (used >= FREE_DAILY_MESSAGE_LIMIT) {
    return { ok: false, reason: "quota_exceeded" };
  }

  return { ok: true, remaining: FREE_DAILY_MESSAGE_LIMIT - used };
}

export async function incrementMessageQuota(env: Env, userId: string, now: number): Promise<void> {
  const key = messageQuotaKey(userId, now);
  const current = parseCount(await env.CONFIG.get(key));
  await env.CONFIG.put(key, String(current + 1), { expirationTtl: MESSAGE_QUOTA_TTL_SECONDS });
}

export async function getMessagesUsedToday(env: Env, userId: string, now: number): Promise<number> {
  return parseCount(await env.CONFIG.get(messageQuotaKey(userId, now)));
}

export function entitlementsForTier(tier: BillingTier): EntitlementsDto {
  return tier === "pro"
    ? {
      custom_companion_limit: null,
      message_limit_daily: null,
      subscriber_soft_message_threshold_daily: SUBSCRIBER_DAILY_SOFT_MESSAGE_THRESHOLD,
      tier,
    }
    : {
      custom_companion_limit: FREE_CUSTOM_COMPANION_LIMIT,
      message_limit_daily: FREE_DAILY_MESSAGE_LIMIT,
      subscriber_soft_message_threshold_daily: null,
      tier,
    };
}

export async function buildUsageDto(env: Env, userId: string, now: number, tier: BillingTier): Promise<UsageDto> {
  const used = await getMessagesUsedToday(env, userId, now);
  return {
    date_utc: formatDateUtc(now),
    message_limit_daily: tier === "pro" ? null : FREE_DAILY_MESSAGE_LIMIT,
    messages_used_today: used,
    subscriber_soft_threshold_exceeded: tier === "pro" && used > SUBSCRIBER_DAILY_SOFT_MESSAGE_THRESHOLD,
  };
}

export function parseCount(raw: string | null): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function formatDateUtc(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMinuteUtc(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export const QUOTA_LIMITS = {
  FREE_DAILY: FREE_DAILY_MESSAGE_LIMIT,
  FREE_CUSTOM_COMPANIONS: FREE_CUSTOM_COMPANION_LIMIT,
  RATE_PER_MINUTE: RATE_LIMIT_PER_MINUTE,
  SUBSCRIBER_DAILY_SOFT: SUBSCRIBER_DAILY_SOFT_MESSAGE_THRESHOLD,
} as const;
