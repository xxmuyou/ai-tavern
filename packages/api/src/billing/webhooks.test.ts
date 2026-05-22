import { describe, expect, it, vi } from "vitest";

import { processStripeWebhookEvent } from "./webhooks";

describe("billing webhooks", () => {
  it("ignores unhandled events but records them", async () => {
    const env = createEnv();
    const stripe = {} as never;
    const result = await processStripeWebhookEvent(env, stripe, {
      data: { object: {} },
      id: "evt_ignored",
      livemode: false,
      type: "customer.created",
    } as never, 1000);

    expect(result).toEqual({ duplicate: false });
    expect(env.statuses.get("evt_ignored")).toBe("ignored");
  });

  it("returns duplicate for already processed events", async () => {
    const env = createEnv();
    env.statuses.set("evt_1", "processed");
    const stripe = {} as never;

    await expect(processStripeWebhookEvent(env, stripe, {
      data: { object: {} },
      id: "evt_1",
      livemode: false,
      type: "customer.created",
    } as never, 1000)).resolves.toEqual({ duplicate: true });
  });

  it("syncs invoice subscriptions by retrieving Stripe's current subscription", async () => {
    const env = createEnv();
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({
          cancel_at_period_end: false,
          customer: "cus_123",
          id: "sub_123",
          items: { data: [{ current_period_end: 20, current_period_start: 10, price: { id: "price_pro" } }] },
          livemode: false,
          metadata: { user_id: "u-1" },
          status: "active",
        })),
      },
    } as never;

    await processStripeWebhookEvent(env, stripe, {
      data: { object: { subscription: "sub_123" } },
      id: "evt_invoice",
      livemode: false,
      type: "invoice.payment_failed",
    } as never, 1000);

    expect(env.statuses.get("evt_invoice")).toBe("processed");
    expect(env.subscriptionUpserts).toBe(1);
  });
});

function createEnv(): Env & {
  statuses: Map<string, string>;
  subscriptionUpserts: number;
} {
  const statuses = new Map<string, string>();
  const env = {
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first() {
                if (sql.includes("FROM billing_webhook_events")) {
                  const status = statuses.get(values[0] as string);
                  return status ? { status } : null;
                }
                if (sql.includes("FROM billing_customers")) {
                  return null;
                }
                return null;
              },
              async run() {
                if (sql.includes("INSERT INTO billing_webhook_events")) {
                  statuses.set(values[0] as string, "processing");
                } else if (sql.includes("UPDATE billing_webhook_events")) {
                  statuses.set(values[3] as string, values[0] as string);
                } else if (sql.includes("INSERT INTO billing_subscriptions")) {
                  env.subscriptionUpserts += 1;
                }
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
    statuses,
    subscriptionUpserts: 0,
  } as unknown as Env & { statuses: Map<string, string>; subscriptionUpserts: number };
  return env;
}
