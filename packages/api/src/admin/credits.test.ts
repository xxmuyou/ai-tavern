import { beforeEach, describe, expect, it } from "vitest";

import { signSession } from "../auth/session";
import {
  createIdentitiesStore,
  createKvStore,
  createSessionsStore,
  createUsersStore,
  type UsersStore,
} from "../auth/test-fixtures";
import type { AuthEnv } from "../auth/types";
import { grantCredits } from "../credits/ledger";
import { createCreditsTestEnv, type CreditsTestEnv } from "../credits/test-fixtures";
import { handleAdminCreditsRequest } from "./credits";

const ADMIN_EMAIL = "admin@xtbit.test";
const ADMIN_ID = "admin-1";
const USER_EMAIL = "player@example.com";
const USER_ID = "user-1";

type TestEnv = AuthEnv & { __credits: CreditsTestEnv; usersStore: UsersStore };

function createEnv(): TestEnv {
  const creditsEnv = createCreditsTestEnv();
  const usersStore = createUsersStore();
  const sessionsStore = createSessionsStore();
  const identitiesStore = createIdentitiesStore();
  const kvStore = createKvStore();

  const isCreditSql = (sql: string): boolean =>
    sql.includes("credit_accounts") || sql.includes("credit_ledger_entries");

  const db = {
    prepare(sql: string) {
      if (isCreditSql(sql)) {
        return creditsEnv.DB.prepare(sql);
      }
      return {
        bind(...values: unknown[]) {
          return {
            __sql: sql,
            __values: values,
            async first() {
              const userResult = usersStore.handle(sql, values);
              if (userResult?.kind === "first") return userResult.result;
              const idResult = identitiesStore.handle(sql, values);
              if (idResult?.kind === "first") return idResult.result;
              const sessionResult = sessionsStore.handle(sql, values);
              if (sessionResult?.kind === "first") return sessionResult.result;
              // admin_user_allowlist / billing_subscriptions: no rows in these tests.
              return null;
            },
            async all() {
              if (sql.includes("FROM users") && sql.includes("OR email LIKE")) {
                const [exact, prefixPattern] = values as [string, string];
                const prefix = prefixPattern.replace(/\\(.)/g, "$1").replace(/%$/, "");
                const limit = values[values.length - 1] as number;
                const rows = usersStore
                  .list()
                  .filter((u) => u.email === exact || u.email.startsWith(prefix))
                  .sort((a, b) => a.email.localeCompare(b.email))
                  .slice(0, limit)
                  .map((u) => ({ email: u.email, id: u.id }));
                return { results: rows };
              }
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
    async batch(statements: { __sql: string; __values: unknown[] }[]) {
      return creditsEnv.DB.batch(statements as never);
    },
  };

  const base = {
    ADMIN_EMAILS: ADMIN_EMAIL,
    APP_ENV: "dev" as const,
    AUTH_TOKEN_SECRET: "test-auth-secret",
    CONFIG: kvStore.asKV(),
    DB: db,
  } as unknown as AuthEnv;

  usersStore.seed({
    id: ADMIN_ID,
    email: ADMIN_EMAIL,
    email_verified: 1,
    display_name: "Admin",
    created_at: 1000,
    last_seen_at: 1000,
  });
  usersStore.seed({
    id: USER_ID,
    email: USER_EMAIL,
    email_verified: 1,
    display_name: "Player",
    created_at: 1000,
    last_seen_at: 1000,
  });

  return Object.assign(base, { __credits: creditsEnv, usersStore }) as TestEnv;
}

async function adminHeaders(env: TestEnv): Promise<Record<string, string>> {
  const session = await signSession(env, { userId: ADMIN_ID, email: ADMIN_EMAIL });
  return { authorization: `Bearer ${session.token}` };
}

async function nonAdminHeaders(env: TestEnv): Promise<Record<string, string>> {
  const session = await signSession(env, { userId: USER_ID, email: USER_EMAIL });
  return { authorization: `Bearer ${session.token}` };
}

let env: TestEnv;
beforeEach(() => {
  env = createEnv();
});

describe("admin credits auth", () => {
  it("returns 401 without a token", async () => {
    const res = await handleAdminCreditsRequest(
      new Request("http://api/admin/users?search=play"),
      env,
      "/admin/users",
    );
    expect(res?.status).toBe(401);
    expect(((await res!.json()) as { error: string }).error).toBe("auth_required");
  });

  it("returns 403 for a non-admin user", async () => {
    const res = await handleAdminCreditsRequest(
      new Request("http://api/admin/users?search=play", { headers: await nonAdminHeaders(env) }),
      env,
      "/admin/users",
    );
    expect(res?.status).toBe(403);
    expect(((await res!.json()) as { error: string }).error).toBe("admin_required");
  });

  it("returns 405 for a wrong method", async () => {
    const res = await handleAdminCreditsRequest(
      new Request("http://api/admin/users", { method: "POST", headers: await adminHeaders(env) }),
      env,
      "/admin/users",
    );
    expect(res?.status).toBe(405);
  });

  it("returns null for an unrelated path", async () => {
    const res = await handleAdminCreditsRequest(
      new Request("http://api/admin/other"),
      env,
      "/admin/other",
    );
    expect(res).toBeNull();
  });
});

describe("GET /admin/users (search)", () => {
  it("returns matching users with tier", async () => {
    const res = await handleAdminCreditsRequest(
      new Request("http://api/admin/users?search=play", { headers: await adminHeaders(env) }),
      env,
      "/admin/users",
    );
    expect(res?.status).toBe(200);
    const body = (await res!.json()) as { users: { user_id: string; email: string; tier: string }[] };
    expect(body.users).toEqual([{ email: USER_EMAIL, tier: "free", user_id: USER_ID }]);
  });

  it("returns 400 when search is empty", async () => {
    const res = await handleAdminCreditsRequest(
      new Request("http://api/admin/users?search=", { headers: await adminHeaders(env) }),
      env,
      "/admin/users",
    );
    expect(res?.status).toBe(400);
    expect(((await res!.json()) as { error: string }).error).toBe("search_required");
  });

  it("returns an empty array on no match", async () => {
    const res = await handleAdminCreditsRequest(
      new Request("http://api/admin/users?search=nobody", { headers: await adminHeaders(env) }),
      env,
      "/admin/users",
    );
    expect(res?.status).toBe(200);
    expect(((await res!.json()) as { users: unknown[] }).users).toEqual([]);
  });
});

describe("GET /admin/users/:id/credits", () => {
  it("returns balance and recent ledger", async () => {
    await grantCredits(env, {
      amount: 50,
      now: Date.now(),
      referenceId: `${USER_ID}:seed`,
      referenceType: "monthly_grant",
      userId: USER_ID,
    });

    const res = await handleAdminCreditsRequest(
      new Request(`http://api/admin/users/${USER_ID}/credits`, { headers: await adminHeaders(env) }),
      env,
      `/admin/users/${USER_ID}/credits`,
    );
    expect(res?.status).toBe(200);
    const body = (await res!.json()) as {
      available_credits: number;
      reserved_credits: number;
      recent_ledger: { type: string; amount: number }[];
    };
    expect(body.available_credits).toBe(50);
    expect(body.reserved_credits).toBe(0);
    expect(body.recent_ledger[0]).toMatchObject({ amount: 50, type: "grant_monthly" });
  });

  it("returns 404 for an unknown user", async () => {
    const res = await handleAdminCreditsRequest(
      new Request("http://api/admin/users/ghost/credits", { headers: await adminHeaders(env) }),
      env,
      "/admin/users/ghost/credits",
    );
    expect(res?.status).toBe(404);
    expect(((await res!.json()) as { error: string }).error).toBe("user_not_found");
  });
});

describe("POST /admin/users/:id/credits/adjustment", () => {
  async function adjust(body: unknown) {
    return handleAdminCreditsRequest(
      new Request(`http://api/admin/users/${USER_ID}/credits/adjustment`, {
        method: "POST",
        headers: { ...(await adminHeaders(env)), "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
      `/admin/users/${USER_ID}/credits/adjustment`,
    );
  }

  it("adds credits and writes an adjustment ledger entry with admin_id + reason", async () => {
    const res = await adjust({ amount: 200, reason: "compensation for failed generation" });
    expect(res?.status).toBe(200);
    const body = (await res!.json()) as {
      available_credits: number;
      entry: { type: string; amount: number; reason: string };
    };
    expect(body.available_credits).toBe(200);
    expect(body.entry).toMatchObject({
      amount: 200,
      reason: "compensation for failed generation",
      type: "adjustment",
    });

    const entry = env.__credits.__state.ledger.find((row) => row.type === "adjustment");
    expect(entry?.metadata).toBeTruthy();
    expect(JSON.parse(entry!.metadata!)).toMatchObject({
      admin_id: ADMIN_ID,
      reason: "compensation for failed generation",
    });
  });

  it("rejects non-positive or non-integer amounts", async () => {
    for (const amount of [0, -5, 1.5]) {
      const res = await adjust({ amount, reason: "x" });
      expect(res?.status).toBe(400);
      expect(((await res!.json()) as { error: string }).error).toBe("invalid_amount");
    }
  });

  it("requires a non-empty reason", async () => {
    const res = await adjust({ amount: 100, reason: "   " });
    expect(res?.status).toBe(400);
    expect(((await res!.json()) as { error: string }).error).toBe("reason_required");
  });

  it("returns 404 for an unknown user", async () => {
    const res = await handleAdminCreditsRequest(
      new Request("http://api/admin/users/ghost/credits/adjustment", {
        method: "POST",
        headers: { ...(await adminHeaders(env)), "content-type": "application/json" },
        body: JSON.stringify({ amount: 100, reason: "x" }),
      }),
      env,
      "/admin/users/ghost/credits/adjustment",
    );
    expect(res?.status).toBe(404);
  });
});
