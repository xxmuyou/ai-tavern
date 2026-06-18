import { describe, expect, it, vi } from "vitest";

import type { EmailSender } from "./email-link";
import { handleSendLink, handleVerify } from "./email-link";
import { LOCAL_ADMIN_EMAIL, LOCAL_VIP_EMAIL } from "./local-email-session";
import { handleMe } from "./me";
import {
  createIdentitiesStore,
  createKvStore,
  createSessionsStore,
  createUsersStore,
  type IdentitiesStore,
  type KvStore,
  type SessionsStore,
  type UsersStore,
} from "./test-fixtures";
import type { AuthEnv } from "./types";
import type { BillingSubscriptionRow } from "../billing/types";

const SUCCESS_URL = "https://dev.aiappsbox.com/auth/success";
const LOCAL_CUSTOM_EMAIL = "custom@test.com";

describe("POST /auth/email/send-link", () => {
  it("rejects invalid email with 400 email_required", async () => {
    const env = createEnv();
    const response = await handleSendLink(
      jsonRequest({ email: "not-an-email" }),
      env,
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("email_required");
  });

  it("returns 405 on non-POST", async () => {
    const env = createEnv();
    const response = await handleSendLink(
      new Request("http://x/auth/email/send-link", { method: "GET" }),
      env,
    );
    expect(response.status).toBe(405);
  });

  it("writes magic:{hash} to KV (hash-only, never plain token) and calls sender", async () => {
    const env = createEnv({ EMAIL_PROVIDER_API_KEY: "rk-test", EMAIL_FROM_ADDRESS: "no-reply@x.com" });
    const sender = vi.fn<EmailSender>(async () => undefined);

    const response = await handleSendLink(
      jsonRequest({ email: "player@example.com", redirect: "/dashboard" }),
      env,
      { sender },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; expires_in: number };
    expect(body).toEqual({ ok: true, expires_in: 900 });

    expect(sender).toHaveBeenCalledTimes(1);
    const call = sender.mock.calls[0]![0];
    expect(call.to).toBe("player@example.com");
    expect(call.from).toBe("no-reply@x.com");
    expect(call.subject).toBe("Your CharaPal sign-in link");
    expect(call.html).toContain("/auth/email/verify?token=");
    expect(call.html).toContain("Sign in or create your account");
    expect(call.text).toContain("/auth/email/verify?token=");
    expect(call.text).toContain("This sign-in link expires in 15 minutes");

    const kvKeys = [...env.kvStore.raw.keys()];
    expect(kvKeys.some((k) => k.startsWith("magic:"))).toBe(true);
    // Stored value contains the email, the normalized redirect, but never the raw token.
    const magicKey = kvKeys.find((k) => k.startsWith("magic:"))!;
    const stored = env.kvStore.raw.get(magicKey)!;
    expect(stored.value).toContain("player@example.com");
    expect(call.html).toContain("token=");
  });

  it("falls back to AUTH_SUCCESS_URL when redirect is not allowlisted", async () => {
    const env = createEnv({ EMAIL_PROVIDER_API_KEY: "rk", EMAIL_FROM_ADDRESS: "x@x.com" });
    await handleSendLink(
      jsonRequest({ email: "player@example.com", redirect: "https://evil.example/" }),
      env,
      { sender: vi.fn<EmailSender>(async () => undefined) },
    );

    const magicKey = [...env.kvStore.raw.keys()].find((k) => k.startsWith("magic:"))!;
    const value = JSON.parse(env.kvStore.raw.get(magicKey)!.value);
    expect(value.redirect).toBe(SUCCESS_URL);
  });

  it("dev w/o EMAIL_PROVIDER_API_KEY: returns verify_url dry-run (no sender call)", async () => {
    const env = createEnv();
    const sender = vi.fn<EmailSender>(async () => undefined);
    const response = await handleSendLink(
      jsonRequest({ email: "player@example.com" }),
      env,
      { sender },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; expires_in: number; verify_url?: string };
    expect(body.ok).toBe(true);
    expect(body.verify_url).toContain("/auth/email/verify?token=");
    expect(sender).not.toHaveBeenCalled();
  });

  it("localhost admin email signs in directly as admin + pro", async () => {
    const env = createEnv();
    const response = await handleSendLink(localJsonRequest({ email: LOCAL_ADMIN_EMAIL }), env);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { email: string; token: string; verify_url?: string };
    expect(body.email).toBe(LOCAL_ADMIN_EMAIL);
    expect(body.token).toBeTruthy();
    expect(body.verify_url).toBeUndefined();

    const me = await fetchMe(env, body.token);
    expect(me.email).toBe(LOCAL_ADMIN_EMAIL);
    expect(me.is_admin).toBe(true);
    expect(me.subscription.tier).toBe("pro");
  });

  it("localhost direct login also works when Wrangler exposes localhost through Host header", async () => {
    const env = createEnv();
    const response = await handleSendLink(
      new Request("http://api.example.com/auth/email/send-link", {
        method: "POST",
        headers: { "content-type": "application/json", host: "127.0.0.1:8787" },
        body: JSON.stringify({ email: LOCAL_ADMIN_EMAIL }),
      }),
      env,
    );

    const body = (await response.json()) as { email: string; token: string };
    expect(body.email).toBe(LOCAL_ADMIN_EMAIL);
    expect(body.token).toBeTruthy();
  });

  it("localhost vip email signs in directly as non-admin pro", async () => {
    const env = createEnv();
    const response = await handleSendLink(localJsonRequest({ email: LOCAL_VIP_EMAIL }), env);
    const body = (await response.json()) as { token: string };

    const me = await fetchMe(env, body.token);
    expect(me.email).toBe(LOCAL_VIP_EMAIL);
    expect(me.is_admin).toBe(false);
    expect(me.subscription).toMatchObject({
      price_id: "price_local_pro",
      status: "active",
      tier: "pro",
    });
  });

  it("localhost custom and arbitrary emails sign in directly as free users", async () => {
    const env = createEnv();
    for (const email of [LOCAL_CUSTOM_EMAIL, "someone@example.com"]) {
      const response = await handleSendLink(localJsonRequest({ email }), env);
      const body = (await response.json()) as { token: string };

      const me = await fetchMe(env, body.token);
      expect(me.email).toBe(email);
      expect(me.is_admin).toBe(false);
      expect(me.subscription.tier).toBe("free");
    }
  });

  it("local direct-login flag signs in directly even when the provider key is configured", async () => {
    const env = createEnv({
      EMAIL_FROM_ADDRESS: "no-reply@x.com",
      EMAIL_PROVIDER_API_KEY: "rk-test",
      LOCAL_EMAIL_DIRECT_LOGIN: "1",
    });
    const sender = vi.fn<EmailSender>(async () => undefined);
    const response = await handleSendLink(
      jsonRequest({ email: "flagged@example.com" }),
      env,
      { sender },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { email: string; token: string; verify_url?: string };
    expect(body.email).toBe("flagged@example.com");
    expect(body.token).toBeTruthy();
    expect(body.verify_url).toBeUndefined();
    expect(sender).not.toHaveBeenCalled();
  });

  it("dev domain still uses magic-link behavior instead of direct session", async () => {
    const env = createEnv();
    const response = await handleSendLink(
      new Request("https://dev.aiappsbox.com/api/auth/email/send-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: LOCAL_ADMIN_EMAIL }),
      }),
      env,
    );

    const body = (await response.json()) as { token?: string; verify_url?: string };
    expect(body.token).toBeUndefined();
    expect(body.verify_url).toContain("/auth/email/verify?token=");
  });

  it("prod w/o EMAIL_PROVIDER_API_KEY: returns 500 email_provider_not_configured", async () => {
    const env = createEnv({ APP_ENV: "prod" });
    const response = await handleSendLink(
      jsonRequest({ email: "player@example.com" }),
      env,
    );
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: string }).error).toBe("email_provider_not_configured");
  });

  it("returns 500 email_send_failed when sender throws", async () => {
    const env = createEnv({ EMAIL_PROVIDER_API_KEY: "rk", EMAIL_FROM_ADDRESS: "x@x.com" });
    const sender = vi.fn<EmailSender>(async () => {
      throw new Error("boom");
    });
    const response = await handleSendLink(
      jsonRequest({ email: "player@example.com" }),
      env,
      { sender },
    );
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: string }).error).toBe("email_send_failed");
  });

  it("throttle: 4th send within an hour silently succeeds without sending or KV write", async () => {
    const env = createEnv({ EMAIL_PROVIDER_API_KEY: "rk", EMAIL_FROM_ADDRESS: "x@x.com" });
    const sender = vi.fn<EmailSender>(async () => undefined);

    for (let i = 0; i < 3; i += 1) {
      const res = await handleSendLink(
        jsonRequest({ email: "player@example.com" }),
        env,
        { sender },
      );
      expect(res.status).toBe(200);
    }
    expect(sender).toHaveBeenCalledTimes(3);
    const magicCountAfterThree = [...env.kvStore.raw.keys()].filter((k) => k.startsWith("magic:"))
      .length;
    expect(magicCountAfterThree).toBe(3);

    // 4th attempt: silent drop, response shape identical
    const fourth = await handleSendLink(
      jsonRequest({ email: "player@example.com" }),
      env,
      { sender },
    );
    expect(fourth.status).toBe(200);
    const body = (await fourth.json()) as { ok: boolean; expires_in: number; verify_url?: string };
    expect(body).toEqual({ ok: true, expires_in: 900 });
    expect(body.verify_url).toBeUndefined();
    expect(sender).toHaveBeenCalledTimes(3); // unchanged
    expect(
      [...env.kvStore.raw.keys()].filter((k) => k.startsWith("magic:")).length,
    ).toBe(3);
  });
});

describe("GET /auth/email/verify", () => {
  it("redirects with error=invalid_magic_link when token is missing", async () => {
    const env = createEnv();
    const response = await handleVerify(
      new Request("http://api/auth/email/verify"),
      env,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${SUCCESS_URL}?error=invalid_magic_link`);
  });

  it("redirects with error=invalid_magic_link for unknown token", async () => {
    const env = createEnv();
    const response = await handleVerify(
      new Request("http://api/auth/email/verify?token=nope"),
      env,
    );
    expect(response.headers.get("location")).toBe(`${SUCCESS_URL}?error=invalid_magic_link`);
  });

  it("consumes the token: replay returns invalid_magic_link", async () => {
    const env = createEnv();
    const sendResponse = await handleSendLink(
      jsonRequest({ email: "player@example.com", redirect: "/dashboard" }),
      env,
    );
    const verifyUrl = ((await sendResponse.json()) as { verify_url: string }).verify_url;

    const firstVerify = await handleVerify(new Request(verifyUrl), env);
    expect(firstVerify.status).toBe(302);
    expect(firstVerify.headers.get("location")).toContain("#token=");

    const secondVerify = await handleVerify(new Request(verifyUrl), env);
    expect(secondVerify.headers.get("location")).toBe(`${SUCCESS_URL}?error=invalid_magic_link`);
  });

  it("on success creates user, signs session, 302 with fragment", async () => {
    const env = createEnv();
    const sendResponse = await handleSendLink(
      jsonRequest({ email: "Player@Example.com", redirect: "/dashboard" }),
      env,
    );
    const verifyUrl = ((await sendResponse.json()) as { verify_url: string }).verify_url;

    const verify = await handleVerify(new Request(verifyUrl), env);
    expect(verify.status).toBe(302);
    const target = new URL(verify.headers.get("location")!);
    expect(target.origin).toBe(new URL(SUCCESS_URL).origin);
    expect(target.pathname).toBe("/dashboard");
    expect(target.hash).toContain(`email=${encodeURIComponent("player@example.com")}`);

    const stored = env.usersStore.getByEmail("player@example.com")!;
    expect(stored.email_verified).toBe(1);
    expect(env.identitiesStore.list()).toMatchObject([
      { provider: "email", provider_subject: "player@example.com" },
    ]);
    expect(env.sessionsStore.list()).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------

function jsonRequest(body: unknown): Request {
  return new Request("http://api.example.com/api/auth/email/send-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function localJsonRequest(body: unknown): Request {
  return new Request("http://localhost:8787/auth/email/send-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function fetchMe(
  env: AuthEnv,
  token: string,
): Promise<{
  email: string;
  is_admin: boolean;
  subscription: { price_id: string | null; status: string; tier: "free" | "pro" };
}> {
  const response = await handleMe(
    new Request("http://localhost:8787/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    }),
    env,
  );
  expect(response.status).toBe(200);
  return response.json();
}

type AdminAllowlistFixture = {
  created_at: number;
  created_by: string | null;
  email: string;
  note: string | null;
};

function createAdminAllowlistStore() {
  const byEmail = new Map<string, AdminAllowlistFixture>();

  return {
    handle(sql: string, values: unknown[]) {
      if (sql.includes("INSERT INTO admin_user_allowlist")) {
        const [email, note, createdAt, createdBy] = values as [string, string | null, number, string | null];
        byEmail.set(email, { email, note, created_at: createdAt, created_by: createdBy });
        return { kind: "run" as const, result: { meta: { changes: 1 } } };
      }
      if (sql.includes("FROM admin_user_allowlist") && sql.includes("WHERE email = ?")) {
        const [email] = values as [string];
        return { kind: "first" as const, result: byEmail.get(email) ?? null };
      }
      return null;
    },
  };
}

function createBillingStore() {
  const subscriptions = new Map<string, BillingSubscriptionRow>();

  return {
    handle(sql: string, values: unknown[]) {
      if (sql.includes("INSERT INTO billing_customers")) {
        return { kind: "run" as const, result: { meta: { changes: 1 } } };
      }
      if (sql.includes("INSERT INTO billing_subscriptions")) {
        const [
          id,
          userId,
          stripeCustomerId,
          status,
          priceId,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd,
          canceledAt,
          livemode,
          rawJson,
          createdAt,
          updatedAt,
        ] = values as [string, string, string, string, string, number, number, number, number | null, number, string, number, number];
        subscriptions.set(id, {
          cancel_at_period_end: cancelAtPeriodEnd,
          canceled_at: canceledAt,
          created_at: createdAt,
          current_period_end: currentPeriodEnd,
          current_period_start: currentPeriodStart,
          id,
          livemode,
          price_id: priceId,
          raw_json: rawJson,
          status,
          stripe_customer_id: stripeCustomerId,
          updated_at: updatedAt,
          user_id: userId,
        });
        return { kind: "run" as const, result: { meta: { changes: 1 } } };
      }
      if (sql.includes("FROM billing_subscriptions")) {
        const [userId, now] = values as [string, number | undefined];
        const rows = [...subscriptions.values()]
          .filter((row) => row.user_id === userId)
          .filter((row) => {
            if (!sql.includes("current_period_end > ?")) return true;
            return (row.status === "active" || row.status === "trialing") && row.current_period_end > (now ?? 0);
          })
          .sort((a, b) => b.current_period_end - a.current_period_end);
        return { kind: "first" as const, result: rows[0] ?? null };
      }
      return null;
    },
  };
}

function createEnv(
  overrides: Record<string, unknown> = {},
): AuthEnv & {
  usersStore: UsersStore;
  identitiesStore: IdentitiesStore;
  sessionsStore: SessionsStore;
  kvStore: KvStore;
} {
  const usersStore = createUsersStore();
  const identitiesStore = createIdentitiesStore();
  const sessionsStore = createSessionsStore();
  const kvStore = createKvStore();
  const adminAllowlistStore = createAdminAllowlistStore();
  const billingStore = createBillingStore();

  const base = {
    APP_ENV: "dev" as const,
    AUTH_SUCCESS_URL: SUCCESS_URL,
    ALLOWED_ORIGINS: `${new URL(SUCCESS_URL).origin},https://dev.aiappsbox.com`,
    AUTH_TOKEN_SECRET: "test-auth-secret",
    CONFIG: kvStore.asKV(),
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first() {
                const userResult = usersStore.handle(sql, values);
                if (userResult?.kind === "first") return userResult.result;
                const idResult = identitiesStore.handle(sql, values);
                if (idResult?.kind === "first") return idResult.result;
                const sessionResult = sessionsStore.handle(sql, values);
                if (sessionResult?.kind === "first") return sessionResult.result;
                const adminResult = adminAllowlistStore.handle(sql, values);
                if (adminResult?.kind === "first") return adminResult.result;
                const billingResult = billingStore.handle(sql, values);
                if (billingResult?.kind === "first") return billingResult.result;
                return null;
              },
              async all() {
                const idResult = identitiesStore.handle(sql, values);
                if (idResult?.kind === "all") return { results: idResult.result };
                return { results: [] };
              },
              async run() {
                const userResult = usersStore.handle(sql, values);
                if (userResult?.kind === "run") return userResult.result;
                const idResult = identitiesStore.handle(sql, values);
                if (idResult?.kind === "run") return idResult.result;
                const sessionResult = sessionsStore.handle(sql, values);
                if (sessionResult?.kind === "run") return sessionResult.result;
                const adminResult = adminAllowlistStore.handle(sql, values);
                if (adminResult?.kind === "run") return adminResult.result;
                const billingResult = billingStore.handle(sql, values);
                if (billingResult?.kind === "run") return billingResult.result;
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  } as unknown as AuthEnv;

  return Object.assign(base, overrides, {
    usersStore,
    identitiesStore,
    sessionsStore,
    kvStore,
  }) as AuthEnv & {
    usersStore: UsersStore;
    identitiesStore: IdentitiesStore;
    sessionsStore: SessionsStore;
    kvStore: KvStore;
  };
}
