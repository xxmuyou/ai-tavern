import { describe, expect, it } from "vitest";

import { getBillingStatus, isProUser } from "./entitlements";
import type { BillingSubscriptionRow } from "./types";

const NOW = Date.UTC(2026, 4, 21, 9, 30, 0);

describe("billing entitlements", () => {
  it("returns free defaults when no active subscription exists", async () => {
    const env = createEnv();

    await expect(isProUser(env, "u-1", NOW)).resolves.toBe(false);
    await expect(getBillingStatus(env, "u-1", NOW)).resolves.toMatchObject({
      entitlements: {
        custom_companion_limit: 3,
        message_limit_daily: 30,
        tier: "free",
      },
      subscription: {
        current_period_end: null,
        status: "free",
        tier: "free",
      },
    });
  });

  it("returns pro entitlements for active unexpired subscriptions", async () => {
    const env = createEnv({
      cancel_at_period_end: 0,
      canceled_at: null,
      created_at: NOW,
      current_period_end: NOW + 1000,
      current_period_start: NOW - 1000,
      id: "sub_123",
      livemode: 0,
      price_id: "price_pro",
      raw_json: "{}",
      status: "active",
      stripe_customer_id: "cus_123",
      updated_at: NOW,
      user_id: "u-1",
    });

    await expect(isProUser(env, "u-1", NOW)).resolves.toBe(true);
    await expect(getBillingStatus(env, "u-1", NOW)).resolves.toMatchObject({
      entitlements: {
        custom_companion_limit: null,
        message_limit_daily: null,
        subscriber_soft_message_threshold_daily: 1000,
        tier: "pro",
      },
      subscription: {
        price_id: "price_pro",
        status: "active",
        tier: "pro",
      },
    });
  });
});

function createEnv(row: BillingSubscriptionRow | null = null): Env {
  return {
    CONFIG: {
      async get() {
        return null;
      },
    },
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes("FROM billing_subscriptions")) return row;
                return null;
              },
            };
          },
        };
      },
    },
  } as unknown as Env;
}
