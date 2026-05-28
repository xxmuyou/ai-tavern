import type { BillingTier } from "../billing/types";
import type { CreditPackageId, CreditTaskType, CreditsEnv } from "./types";

/**
 * Fixed credit cost per task. v1 only charges `image_generation`; `chat_message`
 * is defined but not enforced (see spec-021 §关键决策 3).
 */
export const TASK_CREDIT_COST: Record<CreditTaskType, number> = {
  admin_prewarm: 0,
  chat_message: 1,
  image_generation: 100,
  signal_extract: 0,
  summary: 0,
};

export const MONTHLY_GRANT: Record<BillingTier, number> = {
  free: 50,
  pro: 1000,
};

export const CREDIT_PACKAGES: Record<
  CreditPackageId,
  { credits: number; priceEnv: keyof CreditsEnv }
> = {
  large: { credits: 3000, priceEnv: "STRIPE_PRICE_CREDITS_LARGE" },
  medium: { credits: 1200, priceEnv: "STRIPE_PRICE_CREDITS_MEDIUM" },
  small: { credits: 500, priceEnv: "STRIPE_PRICE_CREDITS_SMALL" },
};

export function isCreditPackageId(value: unknown): value is CreditPackageId {
  return value === "small" || value === "medium" || value === "large";
}
