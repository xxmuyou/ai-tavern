import {
  buildUsageDto,
  entitlementsForTier,
} from "./quota";
import {
  getActiveSubscriptionForUser,
  getLatestSubscriptionForUser,
} from "./repository";
import type { BillingStatusDto, BillingTier, SubscriptionDto } from "./types";

export async function getBillingStatus(
  env: Env,
  userId: string,
  now = Date.now(),
  options: { adminOverride?: boolean } = {},
): Promise<BillingStatusDto> {
  const active = await getActiveSubscriptionForUser(env, userId, now);
  const latest = active ?? await getLatestSubscriptionForUser(env, userId);
  const tier: BillingTier = options.adminOverride || active ? "pro" : "free";

  return {
    entitlements: entitlementsForTier(tier),
    subscription: subscriptionDto(tier, latest),
    usage: await buildUsageDto(env, userId, now, tier),
  };
}

export async function isProUser(env: Env, userId: string, now = Date.now()): Promise<boolean> {
  return Boolean(await getActiveSubscriptionForUser(env, userId, now));
}

function subscriptionDto(
  tier: BillingTier,
  row: Awaited<ReturnType<typeof getLatestSubscriptionForUser>>,
): SubscriptionDto {
  if (!row) {
    return {
      cancel_at_period_end: false,
      current_period_end: null,
      price_id: null,
      status: tier === "pro" ? "active" : "free",
      tier,
    };
  }

  return {
    cancel_at_period_end: row.cancel_at_period_end === 1,
    current_period_end: row.current_period_end,
    price_id: row.price_id,
    status: row.status,
    tier,
  };
}
