import type { BillingTier } from "../billing/types";
import { getSettingNumber } from "../settings/store";
import type { CreditPackageId, CreditTaskType } from "./types";

/**
 * Fixed credit cost per task (pure-credits model, spec-021). Exchange rate is
 * $1 = 1000 credits, so `image_generation` = 40 (~$0.04), `chat_message` = 1
 * (~$0.001), and `voice_generation` = 3 (~$0.003).
 * signal_extract / summary / admin_prewarm are system tasks and never charge
 * the user.
 */
export const TASK_CREDIT_COST: Record<CreditTaskType, number> = {
  admin_prewarm: 0,
  chat_message: 1,
  image_generation: 40,
  signal_extract: 0,
  summary: 0,
  voice_generation: 3,
};

export async function voiceGenerationCreditCost(env: Env): Promise<number> {
  return getSettingNumber(env, "credits.voice_generation_cost", TASK_CREDIT_COST.voice_generation);
}

/** One-time grant on a new user's first balance read (spec-021 §E). */
export const SIGNUP_GRANT = 1000;

export const MONTHLY_GRANT: Record<BillingTier, number> = {
  free: 0,
  pro: 30000,
};

export const CREDIT_PACKAGES: Record<
  CreditPackageId,
  { credits: number; priceSettingKey: string }
> = {
  large: { credits: 40000, priceSettingKey: "billing.credits_large_price" },
  medium: { credits: 15000, priceSettingKey: "billing.credits_medium_price" },
  small: { credits: 5000, priceSettingKey: "billing.credits_small_price" },
};

export function isCreditPackageId(value: unknown): value is CreditPackageId {
  return value === "small" || value === "medium" || value === "large";
}
