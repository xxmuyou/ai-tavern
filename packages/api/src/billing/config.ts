import { jsonResponse } from "../http";
import { isDevRuntime } from "../auth";
import type { BillingEnv } from "./types";

export type BillingConfig = {
  secretKey: string;
  webhookSecret: string;
  priceProMonthly: string;
  successUrl: string;
  cancelUrl: string;
  portalReturnUrl: string;
};

type BillingConfigPurpose = "checkout" | "portal" | "webhook";

const PURPOSE_KEYS: Record<BillingConfigPurpose, Array<keyof BillingConfig>> = {
  checkout: ["secretKey", "priceProMonthly", "successUrl", "cancelUrl"],
  portal: ["secretKey", "portalReturnUrl"],
  webhook: ["secretKey", "webhookSecret"],
};

const ENV_NAMES: Record<keyof BillingConfig, keyof BillingEnv> = {
  cancelUrl: "STRIPE_CANCEL_URL",
  portalReturnUrl: "STRIPE_PORTAL_RETURN_URL",
  priceProMonthly: "STRIPE_PRICE_PRO_MONTHLY",
  secretKey: "STRIPE_SECRET_KEY",
  successUrl: "STRIPE_SUCCESS_URL",
  webhookSecret: "STRIPE_WEBHOOK_SECRET",
};

export function readBillingConfig(env: BillingEnv, purpose: BillingConfigPurpose): BillingConfig {
  const config: BillingConfig = {
    cancelUrl: env.STRIPE_CANCEL_URL?.trim() ?? "",
    portalReturnUrl: env.STRIPE_PORTAL_RETURN_URL?.trim() ?? "",
    priceProMonthly: env.STRIPE_PRICE_PRO_MONTHLY?.trim() ?? "",
    secretKey: env.STRIPE_SECRET_KEY?.trim() ?? "",
    successUrl: env.STRIPE_SUCCESS_URL?.trim() ?? "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() ?? "",
  };

  const missing = PURPOSE_KEYS[purpose]
    .filter((key) => !config[key])
    .map((key) => ENV_NAMES[key]);
  if (missing.length) {
    throw billingConfigError(env, missing);
  }

  return config;
}

export function billingConfigError(env: BillingEnv, missing: Array<keyof BillingEnv>): Response {
  const body: Record<string, unknown> = { error: "billing_config_missing" };
  if (isDevRuntime(env)) {
    body.missing = missing;
  }
  return jsonResponse(body, { status: 500 });
}
