import { describe, expect, it } from "vitest";

import { readBillingConfig } from "./config";
import type { BillingEnv } from "./types";

describe("billing config", () => {
  it("reads checkout config", async () => {
    expect(await readBillingConfig(fullEnv(), "checkout")).toMatchObject({
      cancelUrl: "https://app.example.com/cancel",
      priceProMonthly: "price_pro",
      secretKey: "sk_test_123",
      successUrl: "https://app.example.com/success",
    });
  });

  it("reports missing keys in dev", async () => {
    try {
      await readBillingConfig({ APP_ENV: "dev" } as BillingEnv, "webhook");
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

  it("reads Pro price IDs from env fallback", async () => {
    await expect(
      readBillingConfig(
        {
          APP_BASE_URL: "https://app.example.com",
          APP_ENV: "dev",
          STRIPE_PRICE_PRO_MONTHLY: "price_env",
          STRIPE_SECRET_KEY: "sk_test_123",
        } as unknown as BillingEnv,
        "checkout",
      ),
    ).resolves.toMatchObject({
      priceProMonthly: "price_env",
      secretKey: "sk_test_123",
    });
  });

  it("lets Admin Settings override the env price fallback", async () => {
    await expect(
      readBillingConfig(
        {
          APP_BASE_URL: "https://app.example.com",
          APP_ENV: "dev",
          DB: settingsDb({ "billing.pro_monthly_price": "price_db" }),
          STRIPE_PRICE_PRO_MONTHLY: "price_env",
          STRIPE_SECRET_KEY: "sk_test_123",
        } as unknown as BillingEnv,
        "checkout",
      ),
    ).resolves.toMatchObject({
      priceProMonthly: "price_db",
    });
  });
});

function fullEnv(): BillingEnv {
  return {
    APP_ENV: "dev",
    DB: settingsDb({ "billing.pro_monthly_price": "price_pro" }),
    STRIPE_CANCEL_URL: "https://app.example.com/cancel",
    STRIPE_PORTAL_RETURN_URL: "https://app.example.com/portal",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_SUCCESS_URL: "https://app.example.com/success",
    STRIPE_WEBHOOK_SECRET: "whsec_123",
  } as unknown as BillingEnv;
}

function settingsDb(settings: Record<string, string>) {
  return {
    prepare(sql: string) {
      return {
        async all() {
          if (!sql.includes("FROM app_settings")) return { results: [] };
          return {
            results: Object.entries(settings).map(([key, value]) => ({ key, value })),
          };
        },
      };
    },
  };
}
