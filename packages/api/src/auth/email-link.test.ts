import { describe, expect, it, vi } from "vitest";

import type { EmailSender } from "./email-link";
import { handleSendLink, handleVerify } from "./email-link";
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

const SUCCESS_URL = "https://dev.aiappsbox.com/auth/success";

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
    expect(call.html).toContain("/auth/email/verify?token=");

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
