import { describe, expect, it } from "vitest";

import { readBillingConfig } from "./config";
import type { BillingEnv } from "./types";

describe("billing config", () => {
  it("reads checkout config", () => {
    expect(readBillingConfig(fullEnv(), "checkout")).toMatchObject({
      cancelUrl: "https://app.example.com/cancel",
      priceProMonthly: "price_pro",
      secretKey: "sk_test_123",
      successUrl: "https://app.example.com/success",
    });
  });

  it("reports missing keys in dev", async () => {
    try {
      readBillingConfig({ APP_ENV: "dev" } as BillingEnv, "webhook");
      throw new Error("expected config error");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      const body = await (err as Response).json();
      expect(body).toEqual({
        error: "billing_config_missing",
        missing: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      });
    }
  });
});

function fullEnv(): BillingEnv {
  return {
    APP_ENV: "dev",
    STRIPE_CANCEL_URL: "https://app.example.com/cancel",
    STRIPE_PORTAL_RETURN_URL: "https://app.example.com/portal",
    STRIPE_PRICE_PRO_MONTHLY: "price_pro",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_SUCCESS_URL: "https://app.example.com/success",
    STRIPE_WEBHOOK_SECRET: "whsec_123",
  } as unknown as BillingEnv;
}
