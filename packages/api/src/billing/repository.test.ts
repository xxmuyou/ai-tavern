import { describe, expect, it } from "vitest";

import {
  beginWebhookEvent,
  finishWebhookEvent,
  secondsToMillis,
  upsertBillingCustomer,
  upsertSubscriptionFromStripe,
} from "./repository";
import type { StripeSubscriptionLike } from "./types";

describe("billing repository", () => {
  it("converts Stripe seconds to milliseconds when persisting subscriptions", async () => {
    const env = createEnv();
    await upsertSubscriptionFromStripe(env, {
      cancel_at_period_end: false,
      canceled_at: 1_770_000_300,
      customer: "cus_123",
      id: "sub_123",
      items: {
        data: [{
          current_period_end: 1_770_000_200,
          current_period_start: 1_770_000_100,
          price: { id: "price_pro" },
        }],
      },
      livemode: false,
      status: "active",
    } as unknown as StripeSubscriptionLike, "u-1", 1234);

    const values = env.runs[0]?.values ?? [];
    expect(values[5]).toBe(1_770_000_100_000);
    expect(values[6]).toBe(1_770_000_200_000);
    expect(values[8]).toBe(1_770_000_300_000);
  });

  it("upserts customers", async () => {
    const env = createEnv();
    await upsertBillingCustomer(env, {
      email: "player@example.com",
      livemode: false,
      now: 1234,
      stripeCustomerId: "cus_123",
      userId: "u-1",
    });
    expect(env.runs[0]?.sql).toContain("INSERT INTO billing_customers");
    expect(env.runs[0]?.values.slice(0, 3)).toEqual(["u-1", "cus_123", "player@example.com"]);
  });

  it("starts, duplicates, retries, and finishes webhook events", async () => {
    const env = createEnv();
    const event = {
      id: "evt_123",
      livemode: false,
      type: "customer.subscription.updated",
    } as const;

    await expect(beginWebhookEvent(env, event, 1000)).resolves.toEqual({ action: "process" });
    await expect(beginWebhookEvent(env, event, 1001)).resolves.toEqual({
      action: "duplicate",
      status: "processing",
    });
    await finishWebhookEvent(env, event.id, "failed", 1002, "boom");
    await expect(beginWebhookEvent(env, event, 1003)).resolves.toEqual({ action: "process" });
    await finishWebhookEvent(env, event.id, "processed", 1004);
    await expect(beginWebhookEvent(env, event, 1005)).resolves.toEqual({
      action: "duplicate",
      status: "processed",
    });
  });

  it("converts nullable seconds", () => {
    expect(secondsToMillis(100)).toBe(100_000);
    expect(secondsToMillis(null)).toBeNull();
  });
});

function createEnv(): Env & { runs: Array<{ sql: string; values: unknown[] }> } {
  const runs: Array<{ sql: string; values: unknown[] }> = [];
  const webhookStatuses = new Map<string, string>();
  const env = {
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first() {
                if (sql.includes("FROM billing_webhook_events")) {
                  const status = webhookStatuses.get(values[0] as string);
                  return status ? { status } : null;
                }
                return null;
              },
              async run() {
                runs.push({ sql, values });
                if (sql.includes("INSERT INTO billing_webhook_events")) {
                  webhookStatuses.set(values[0] as string, "processing");
                } else if (sql.includes("status = 'processing'")) {
                  webhookStatuses.set(values[0] as string, "processing");
                } else if (sql.includes("UPDATE billing_webhook_events")) {
                  webhookStatuses.set(values[3] as string, values[0] as string);
                }
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
    runs,
  } as unknown as Env & { runs: Array<{ sql: string; values: unknown[] }> };
  return env;
}
