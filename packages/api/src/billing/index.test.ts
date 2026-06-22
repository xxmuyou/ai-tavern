import { describe, expect, it, vi } from "vitest";

import { signSession } from "../auth/session";
import { createSessionsStore, createUsersStore } from "../auth/test-fixtures";
import { handleBillingRequest } from "./index";
import { createCheckoutSession } from "./stripe";

vi.mock("./stripe", () => ({
  constructWebhookEvent: vi.fn(),
  createCheckoutSession: vi.fn(async () => ({ url: "https://checkout.stripe.test/session" })),
  createCustomer: vi.fn(async () => ({ id: "cus_new", livemode: false })),
  createCustomerPortalSession: vi.fn(async () => ({ url: "https://billing.stripe.test/session" })),
  createStripeClient: vi.fn(() => ({})),
}));

describe("billing routes", () => {
  it("requires auth for checkout", async () => {
    await expect(
      handleBillingRequest(
        new Request("http://api/billing/checkout", { method: "POST" }),
        createEnv(),
        ctx(),
        "/billing/checkout",
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("returns status for authenticated users", async () => {
    const env = createEnv();
    const token = await issueToken(env);
    const response = await handleBillingRequest(
      new Request("http://api/billing/status", {
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
      ctx(),
      "/billing/status",
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      entitlements: { message_limit_daily: 30, tier: "free" },
      subscription: { status: "free", tier: "free" },
    });
  });

  it("returns pro status for admins without a paid subscription", async () => {
    const env = createEnv();
    const token = await issueAdminToken(env);
    const response = await handleBillingRequest(
      new Request("http://api/billing/status", {
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
      ctx(),
      "/billing/status",
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      entitlements: { tier: "pro" },
      subscription: { tier: "pro" },
    });
  });

  it("creates checkout sessions with server-side price config", async () => {
    const env = createEnv();
    const token = await issueToken(env);
    const response = await handleBillingRequest(
      new Request("http://api/billing/checkout", {
        body: JSON.stringify({ price_id: "price_attacker" }),
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        method: "POST",
      }),
      env,
      ctx(),
      "/billing/checkout",
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({ checkout_url: "https://checkout.stripe.test/session" });
    expect(vi.mocked(createCheckoutSession).mock.calls.at(-1)?.[1]).toMatchObject({
      analyticsMetadata: {},
      priceId: "price_pro",
      userId: "user-1",
    });
  });

  it("passes advertising attribution into checkout metadata", async () => {
    const env = createEnv();
    const token = await issueToken(env);
    const response = await handleBillingRequest(
      new Request("http://api/billing/checkout", {
        body: JSON.stringify({
          analytics: {
            anonymous_id: "anon-ad",
            session_id: "sess-ad",
            utm_source: "google",
            utm_campaign: "launch",
            utm_term: "ai_character_chat",
            gclid: "gclid-test",
          },
        }),
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        method: "POST",
      }),
      env,
      ctx(),
      "/billing/checkout",
    );

    expect(response?.status).toBe(200);
    expect(vi.mocked(createCheckoutSession).mock.calls.at(-1)?.[1].analyticsMetadata).toMatchObject({
      analytics_anonymous_id: "anon-ad",
      analytics_session_id: "sess-ad",
      gclid: "gclid-test",
      utm_campaign: "launch",
      utm_source: "google",
      utm_term: "ai_character_chat",
    });
  });


  it("returns 404 for portal when no billing customer exists", async () => {
    const env = createEnv({
      STRIPE_PORTAL_RETURN_URL: "https://app.example.com/billing",
      STRIPE_SECRET_KEY: "sk_test_123",
    });
    const token = await issueToken(env);
    const response = await handleBillingRequest(
      new Request("http://api/billing/portal", {
        headers: { authorization: `Bearer ${token}` },
        method: "POST",
      }),
      env,
      ctx(),
      "/billing/portal",
    );

    expect(response?.status).toBe(404);
    await expect(response?.json()).resolves.toEqual({ error: "billing_customer_not_found" });
  });
});

async function issueToken(env: Env): Promise<string> {
  const session = await signSession(env, { email: "player@example.com", userId: "user-1" });
  return session.token;
}

async function issueAdminToken(env: Env): Promise<string> {
  const session = await signSession(env, { email: "admin@aiappsbox.com", userId: "user-admin" });
  return session.token;
}

function createEnv(
  overrides: Record<string, unknown> = {},
  settings: Record<string, string> = { "billing.pro_monthly_price": "price_pro" },
): Env {
  const usersStore = createUsersStore([
    {
      created_at: 1000,
      display_name: "Player",
      email: "player@example.com",
      email_verified: 1,
      id: "user-1",
      last_seen_at: 1000,
    },
    {
      created_at: 1000,
      display_name: "Admin",
      email: "admin@aiappsbox.com",
      email_verified: 1,
      id: "user-admin",
      last_seen_at: 1000,
    },
  ]);
  const sessionsStore = createSessionsStore();

  const env = {
    APP_ENV: "dev",
    AUTH_TOKEN_SECRET: "test-auth-secret",
    CONFIG: {
      async get() {
        return null;
      },
      async put() {},
    },
    DB: {
      prepare(sql: string) {
        return {
          async all() {
            if (!sql.includes("FROM app_settings")) return { results: [] };
            return {
              results: Object.entries(settings).map(([key, value]) => ({ key, value })),
            };
          },
          bind(...values: unknown[]) {
            return {
              async first() {
                const userResult = usersStore.handle(sql, values);
                if (userResult?.kind === "first") return userResult.result;
                const sessionResult = sessionsStore.handle(sql, values);
                if (sessionResult?.kind === "first") return sessionResult.result;
                return null;
              },
              async run() {
                const userResult = usersStore.handle(sql, values);
                if (userResult?.kind === "run") return userResult.result;
                const sessionResult = sessionsStore.handle(sql, values);
                if (sessionResult?.kind === "run") return sessionResult.result;
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
    STRIPE_CANCEL_URL: "https://app.example.com/cancel",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_SUCCESS_URL: "https://app.example.com/success",
    ...overrides,
  };
  return env as unknown as Env;
}

function ctx(): ExecutionContext {
  return {
    passThroughOnException() {},
    waitUntil() {},
  } as unknown as ExecutionContext;
}
