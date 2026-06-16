import { jsonResponse } from "../http";
import { isDevRuntime } from "../auth";
import { getSetting } from "../settings/store";
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

const CONFIG_NAMES: Record<keyof BillingConfig, string> = {
  cancelUrl: "STRIPE_CANCEL_URL",
  portalReturnUrl: "STRIPE_PORTAL_RETURN_URL",
  priceProMonthly: "STRIPE_PRICE_PRO_MONTHLY",
  secretKey: "STRIPE_SECRET_KEY",
  successUrl: "STRIPE_SUCCESS_URL",
  webhookSecret: "STRIPE_WEBHOOK_SECRET",
};

export async function readBillingConfig(env: BillingEnv, purpose: BillingConfigPurpose): Promise<BillingConfig> {
  const config: BillingConfig = {
    cancelUrl: (await getSetting(env, "billing.cancel_url")) ?? "",
    portalReturnUrl: (await getSetting(env, "billing.portal_return_url")) ?? "",
    priceProMonthly: (await getSetting(env, "billing.pro_monthly_price")) ?? "",
    secretKey: (await getSetting(env, "billing.stripe_secret_key")) ?? "",
    successUrl: (await getSetting(env, "billing.success_url")) ?? "",
    webhookSecret: (await getSetting(env, "billing.stripe_webhook_secret")) ?? "",
  };

  const missing = PURPOSE_KEYS[purpose]
    .filter((key) => !config[key])
    .map((key) => CONFIG_NAMES[key]);
  if (missing.length) {
    throw billingConfigError(env, missing);
  }

  return config;
}

export function billingConfigError(env: BillingEnv, missing: string[]): Response {
  const body: Record<string, unknown> = { error: "billing_config_missing" };
  if (isDevRuntime(env)) {
    body.missing = missing;
  }
  return jsonResponse(body, { status: 500 });
}
