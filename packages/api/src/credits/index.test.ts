import { beforeEach, describe, expect, it } from "vitest";

import { signSession } from "../auth/session";
import { createKvStore, createSessionsStore, createUsersStore, type UsersStore } from "../auth/test-fixtures";
import type { AuthEnv } from "../auth/types";
import { handleCreditsRequest } from "./index";
import { createCreditsTestEnv, type CreditsTestEnv } from "./test-fixtures";

const USER_EMAIL = "player@example.com";
const USER_ID = "user-1";

type TestEnv = AuthEnv & { __credits: CreditsTestEnv; usersStore: UsersStore };

function createEnv(): TestEnv {
  const creditsEnv = createCreditsTestEnv();
  const usersStore = createUsersStore();
  const sessionsStore = createSessionsStore();
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
            async first() {
              const userResult = usersStore.handle(sql, values);
              if (userResult?.kind === "first") return userResult.result;
              const sessionResult = sessionsStore.handle(sql, values);
              if (sessionResult?.kind === "first") return sessionResult.result;
              if (sql.includes("FROM billing_subscriptions")) return null;
              return null;
            },
            async all() {
              return { results: [] };
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
    async batch(statements: { __sql: string; __values: unknown[] }[]) {
      return creditsEnv.DB.batch(statements as never);
    },
  };

  const base = {
    APP_ENV: "dev" as const,
    AUTH_TOKEN_SECRET: "test-auth-secret",
    CONFIG: kvStore.asKV(),
    DB: db,
  } as unknown as AuthEnv;

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

async function authHeaders(env: TestEnv): Promise<Record<string, string>> {
  const session = await signSession(env, { userId: USER_ID, email: USER_EMAIL });
  return { authorization: `Bearer ${session.token}` };
}

let env: TestEnv;
beforeEach(() => {
  env = createEnv();
});

describe("GET /credits/balance", () => {
  it("returns signup credits and no monthly grant for free users", async () => {
    const res = await handleCreditsRequest(
      new Request("http://api/credits/balance", { headers: await authHeaders(env) }),
      env,
      "/credits/balance",
    );

    expect(res?.status).toBe(200);
    await expect(res!.json()).resolves.toEqual({
      available_credits: 1000,
      monthly_grant: null,
      reserved_credits: 0,
    });
  });
});
