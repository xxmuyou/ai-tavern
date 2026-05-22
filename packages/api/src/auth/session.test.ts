import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { revokeSession, signSession, verifyAuthToken, verifyRequestAuth } from "./session";
import { createSessionsStore, type SessionsStore } from "./test-fixtures";
import type { AuthEnv } from "./types";

describe("signSession", () => {
  it("writes a sessions row with jti and returns ISO expiresAt", async () => {
    const env = createEnv();
    const result = await signSession(env, {
      userId: "u-1",
      email: "player@example.com",
      ttlSeconds: 60,
      now: 1_700_000_000_000,
    });

    expect(result.email).toBe("player@example.com");
    expect(result.user).toEqual({ id: "u-1", email: "player@example.com" });
    expect(result.expiresAt).toBe(new Date(1_700_000_060_000).toISOString());
    expect(typeof result.token).toBe("string");

    const rows = env.sessionsStore.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe("u-1");
    expect(rows[0]?.revoked_at).toBeNull();
    expect(rows[0]?.expires_at).toBe(1_700_000_060_000);
  });

  it("uses JWT_SIGNING_KEY when set, falling back to AUTH_TOKEN_SECRET", async () => {
    const env = createEnv({ JWT_SIGNING_KEY: "primary-key" });
    const result = await signSession(env, { userId: "u-1", email: "a@b.com" });
    const verified = await verifyAuthToken(env, result.token);
    expect(verified.email).toBe("a@b.com");
    expect(verified.jti).toBeTruthy();
  });

  it("throws auth_secret_missing in prod when both secrets are absent", async () => {
    const env = createEnv({ APP_ENV: "prod", AUTH_TOKEN_SECRET: undefined, JWT_SIGNING_KEY: undefined });
    await expect(signSession(env, { userId: "u-1", email: "a@b.com" })).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe("verifyAuthToken", () => {
  it("rejects legacy tokens without jti (strict cutoff strategy)", async () => {
    const env = createEnv();
    // Manually sign an old-shape token (no jti) using the same secret.
    const secret = new TextEncoder().encode("test-auth-secret");
    const legacyToken = await new SignJWT({ email: "player@example.com" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("u-1")
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(secret);

    await expect(verifyAuthToken(env, legacyToken)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects when sessions row does not exist (token signed by attacker)", async () => {
    const env = createEnv();
    const secret = new TextEncoder().encode("test-auth-secret");
    const forged = await new SignJWT({ email: "player@example.com", jti: "fake-jti" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("u-1")
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(secret);

    await expect(verifyAuthToken(env, forged)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects revoked session with session_revoked error", async () => {
    const env = createEnv();
    const { token } = await signSession(env, { userId: "u-1", email: "a@b.com" });
    const jti = env.sessionsStore.list()[0]!.jwt_jti;
    await revokeSession(env, jti);

    await expect(verifyAuthToken(env, token)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects expired session even if JWT exp still in future", async () => {
    const env = createEnv();
    const { token } = await signSession(env, { userId: "u-1", email: "a@b.com" });
    const fixture = env.sessionsStore.list()[0]!;
    // Manually expire the session row
    fixture.expires_at = Date.now() - 1000;

    await expect(verifyAuthToken(env, token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects malformed token", async () => {
    const env = createEnv();
    await expect(verifyAuthToken(env, "not.a.jwt")).rejects.toMatchObject({ status: 401 });
  });
});

describe("verifyRequestAuth", () => {
  it("returns null when no Authorization header", async () => {
    const env = createEnv();
    const result = await verifyRequestAuth(env, new Request("http://x/"));
    expect(result).toBeNull();
  });

  it("returns payload for valid Bearer token", async () => {
    const env = createEnv();
    const { token } = await signSession(env, { userId: "u-1", email: "a@b.com" });
    const result = await verifyRequestAuth(
      env,
      new Request("http://x/", { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(result?.email).toBe("a@b.com");
    expect(result?.sub).toBe("u-1");
    expect(result?.jti).toBeTruthy();
  });
});

describe("revokeSession", () => {
  it("only marks current jti revoked, leaves other sessions for same user untouched", async () => {
    const env = createEnv();
    const first = await signSession(env, { userId: "u-1", email: "a@b.com" });
    const second = await signSession(env, { userId: "u-1", email: "a@b.com" });

    const firstJti = env.sessionsStore.list()[0]!.jwt_jti;
    await revokeSession(env, firstJti);

    await expect(verifyAuthToken(env, first.token)).rejects.toMatchObject({ status: 401 });
    await expect(verifyAuthToken(env, second.token)).resolves.toMatchObject({ email: "a@b.com" });
  });
});

function createEnv(overrides: Record<string, unknown> = {}): AuthEnv & { sessionsStore: SessionsStore } {
  const sessionsStore = createSessionsStore();
  const base = {
    APP_ENV: "dev" as const,
    AUTH_TOKEN_SECRET: "test-auth-secret",
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first() {
                const result = sessionsStore.handle(sql, values);
                if (result?.kind === "first") return result.result;
                return null;
              },
              async run() {
                const result = sessionsStore.handle(sql, values);
                if (result?.kind === "run") return result.result;
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  } as unknown as AuthEnv;

  return Object.assign(base, overrides, { sessionsStore }) as AuthEnv & { sessionsStore: SessionsStore };
}
