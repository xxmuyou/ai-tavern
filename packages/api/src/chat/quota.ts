const FREE_DAILY_LIMIT = 30;
const SUBSCRIBER_DAILY_SOFT_LIMIT = 1000;
const RATE_LIMIT_PER_MINUTE = 10;
const DAY_TTL_SECONDS = 90_000; // ~25h, survives DST + UTC rollover
const MINUTE_TTL_SECONDS = 120;

export type QuotaCheck = { ok: true; remaining: number } | { ok: false; reason: "quota_exceeded" };
export type RateCheck = { ok: true } | { ok: false; reason: "rate_limited" };

export function dailyKey(userId: string, now: number, subscriber: boolean): string {
  const date = formatDateUtc(now);
  return subscriber ? `quota:${userId}:${date}:sub` : `quota:${userId}:${date}`;
}

export function minuteKey(userId: string, now: number): string {
  return `ratelimit:${userId}:${formatMinuteUtc(now)}`;
}

export async function isSubscriberActive(env: Env, userId: string, now: number): Promise<boolean> {
  // Schema is in place (spec-003 subscriptions table); spec-010 will fill rows.
  // Until then every user is treated as free tier.
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM subscriptions
      WHERE user_id = ? AND status = 'active' AND current_period_end > ?
      LIMIT 1`,
  )
    .bind(userId, now)
    .first<{ ok: number }>();
  return !!row;
}

export async function checkRateLimit(env: Env, userId: string, now: number): Promise<RateCheck> {
  const key = minuteKey(userId, now);
  const current = parseCount(await env.CONFIG.get(key));
  if (current >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, reason: "rate_limited" };
  }
  await env.CONFIG.put(key, String(current + 1), { expirationTtl: MINUTE_TTL_SECONDS });
  return { ok: true };
}

export async function checkQuota(
  env: Env,
  userId: string,
  now: number,
  subscriber: boolean,
): Promise<QuotaCheck> {
  const limit = subscriber ? SUBSCRIBER_DAILY_SOFT_LIMIT : FREE_DAILY_LIMIT;
  const key = dailyKey(userId, now, subscriber);
  const current = parseCount(await env.CONFIG.get(key));
  if (current >= limit) {
    return { ok: false, reason: "quota_exceeded" };
  }
  return { ok: true, remaining: limit - current };
}

export async function incrementQuota(
  env: Env,
  userId: string,
  now: number,
  subscriber: boolean,
): Promise<void> {
  const key = dailyKey(userId, now, subscriber);
  const current = parseCount(await env.CONFIG.get(key));
  await env.CONFIG.put(key, String(current + 1), { expirationTtl: DAY_TTL_SECONDS });
}

function parseCount(raw: string | null): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatDateUtc(ts: number): string {
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
  FREE_DAILY: FREE_DAILY_LIMIT,
  RATE_PER_MINUTE: RATE_LIMIT_PER_MINUTE,
  SUBSCRIBER_DAILY_SOFT: SUBSCRIBER_DAILY_SOFT_LIMIT,
} as const;
