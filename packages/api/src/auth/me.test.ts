import { describe, expect, it } from "vitest";

import { handleLogout, handleMe } from "./me";
import { signSession } from "./session";
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

const SUCCESS_URL = "https://dev.xtbit-apps.pages.dev/auth/success";

describe("GET /auth/me", () => {
  it("returns 401 auth_required when no token", async () => {
    const env = createEnv();
    const response = await handleMe(new Request("http://api/auth/me"), env);
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe("auth_required");
  });

  it("returns 405 on non-GET", async () => {
    const env = createEnv();
    const response = await handleMe(
      new Request("http://api/auth/me", { method: "POST" }),
      env,
    );
    expect(response.status).toBe(405);
  });

  it("returns user profile with linked_providers, subscription, and quota", async () => {
    const env = createEnv();
    const session = await signSession(env, { userId: "user-1", email: "player@example.com" });

    // Seed the user record
    env.usersStore.seed({
      id: "user-1",
      email: "player@example.com",
      email_verified: 1,
      display_name: "Player",
      created_at: 1000,
      last_seen_at: 1000,
    });
    env.identitiesStore.seed({
      id: "id-1",
      user_id: "user-1",
      provider: "email",
      provider_subject: "player@example.com",
      provider_email: "player@example.com",
      created_at: 1000,
    });

    const response = await handleMe(
      new Request("http://api/auth/me", {
        headers: { authorization: `Bearer ${session.token}` },
      }),
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      email: string;
      email_verified: boolean;
      display_name: string | null;
      linked_providers: string[];
      subscription: { status: string; current_period_end: null };
      quota: { messages_used_today: number; messages_limit_today: number };
    };
    expect(body.id).toBe("user-1");
    expect(body.email).toBe("player@example.com");
    expect(body.email_verified).toBe(true);
    expect(body.display_name).toBe("Player");
    expect(body.linked_providers).toEqual(["email"]);
    expect(body.subscription).toEqual({ status: "free", current_period_end: null });
    expect(body.quota).toEqual({ messages_used_today: 0, messages_limit_today: 30 });
  });

  it("returns 401 for revoked session", async () => {
    const env = createEnv();
    const session = await signSession(env, { userId: "user-1", email: "player@example.com" });
    env.usersStore.seed({
      id: "user-1",
      email: "player@example.com",
      email_verified: 1,
      display_name: null,
      created_at: 1000,
      last_seen_at: 1000,
    });

    // Revoke the session directly via the sessions store
    const jtiSession = env.sessionsStore.list().find((s) => s.user_id === "user-1")!;
    env.sessionsStore.handle(
      "UPDATE sessions SET revoked_at = ? WHERE jwt_jti = ? AND revoked_at IS NULL",
      [Date.now(), jtiSession.jwt_jti],
    );

    const response = await handleMe(
      new Request("http://api/auth/me", {
        headers: { authorization: `Bearer ${session.token}` },
      }),
      env,
    );
    expect(response.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("returns 401 auth_required when no token", async () => {
    const env = createEnv();
    const response = await handleLogout(
      new Request("http://api/auth/logout", { method: "POST" }),
      env,
    );
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe("auth_required");
  });

  it("returns 405 on non-POST", async () => {
    const env = createEnv();
    const response = await handleLogout(
      new Request("http://api/auth/logout", { method: "GET" }),
      env,
    );
    expect(response.status).toBe(405);
  });

  it("revokes session: subsequent /auth/me returns 401", async () => {
    const env = createEnv();
    const session = await signSession(env, { userId: "user-1", email: "player@example.com" });
    env.usersStore.seed({
      id: "user-1",
      email: "player@example.com",
      email_verified: 1,
      display_name: null,
      created_at: 1000,
      last_seen_at: 1000,
    });

    const logoutResponse = await handleLogout(
      new Request("http://api/auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${session.token}` },
      }),
      env,
    );
    expect(logoutResponse.status).toBe(200);
    expect(((await logoutResponse.json()) as { ok: boolean }).ok).toBe(true);

    const meResponse = await handleMe(
      new Request("http://api/auth/me", {
        headers: { authorization: `Bearer ${session.token}` },
      }),
      env,
    );
    expect(meResponse.status).toBe(401);
  });

  it("returns 401 for an already-invalid token", async () => {
    const env = createEnv();
    const response = await handleLogout(
      new Request("http://api/auth/logout", {
        method: "POST",
        headers: { authorization: "Bearer totally-invalid-token" },
      }),
      env,
    );
    expect(response.status).toBe(401);
  });
});

// -----------------------------------------------------------------------------

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
