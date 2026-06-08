import type { BillingTier } from "../billing/types";
import type { CreditPackageId, CreditTaskType, CreditsEnv } from "./types";

/**
 * Fixed credit cost per task (pure-credits model, spec-021). Exchange rate is
 * $1 = 1000 credits, so `image_generation` = 50 (~$0.05) and `chat_message` = 1
 * (~$0.001), both actually charged. signal_extract / summary / admin_prewarm are
 * system tasks and never charge the user.
 */
export const TASK_CREDIT_COST: Record<CreditTaskType, number> = {
  admin_prewarm: 0,
  chat_message: 1,
  image_generation: 50,
  signal_extract: 0,
  summary: 0,
};

/** One-time grant on a new user's first balance read (spec-021 §E). */
export const SIGNUP_GRANT = 2000;

export const MONTHLY_GRANT: Record<BillingTier, number> = {
  free: 1000,
  pro: 30000,
};

export const CREDIT_PACKAGES: Record<
  CreditPackageId,
  { credits: number; priceEnv: keyof CreditsEnv }
> = {
  large: { credits: 40000, priceEnv: "STRIPE_PRICE_CREDITS_LARGE" },
  medium: { credits: 15000, priceEnv: "STRIPE_PRICE_CREDITS_MEDIUM" },
  small: { credits: 5000, priceEnv: "STRIPE_PRICE_CREDITS_SMALL" },
};

export function isCreditPackageId(value: unknown): value is CreditPackageId {
  return value === "small" || value === "medium" || value === "large";
}
