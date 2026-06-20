import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signSession } from "../auth/session";
import { createKvStore, createSessionsStore, createUsersStore, type UsersStore } from "../auth/test-fixtures";
import type { AuthEnv } from "../auth/types";
import {
  adjustCredits,
  commitReservation,
  grantCredits,
  recordPurchase,
  refundCredits,
  releaseReservation,
  reserveCredits,
} from "./ledger";
import { handleCreditsRequest } from "./index";
import { createCreditsTestEnv, type CreditsTestEnv } from "./test-fixtures";
import type { CreditActivityEntry } from "./types";

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

afterEach(() => {
  vi.useRealTimers();
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

describe("GET /credits/ledger", () => {
  it("returns a spent activity for a committed reserve without exposing commit zero as user activity", async () => {
    await grantTestCredits(1_000, 1_000);
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const reservation = await reserveCredits(env, {
      amount: 1,
      referenceId: "chat-1",
      referenceType: "chat_message",
      taskType: "chat_message",
      userId: USER_ID,
    });
    vi.setSystemTime(3_000);
    await commitReservation(env, reservation.reservation_id);

    const body = await ledgerBody();

    expect(body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amount: 0, task_type: "chat_message", type: "commit" }),
        expect.objectContaining({ amount: -1, task_type: "chat_message", type: "reserve" }),
      ]),
    );
    expect(body.activities).toEqual([
      expect.objectContaining({
        amount: -1,
        task_type: "chat_message",
        title: "Spent · Chat message",
        type: "spent",
      }),
      expect.objectContaining({
        amount: 1_000,
        title: "Signup credits",
        type: "signup_credits",
      }),
    ]);
    expect(body.activities.some((activity) => activity.amount === 0)).toBe(false);
  });

  it("returns released and pending activities for failed and in-flight reservations", async () => {
    await grantTestCredits(1_000, 1_000);
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const failed = await reserveCredits(env, {
      amount: 40,
      referenceId: "image-failed",
      referenceType: "image_job",
      taskType: "image_generation",
      userId: USER_ID,
    });
    vi.setSystemTime(3_000);
    await releaseReservation(env, failed.reservation_id, "provider_failed");
    vi.setSystemTime(4_000);
    await reserveCredits(env, {
      amount: 40,
      referenceId: "image-pending",
      referenceType: "image_job",
      taskType: "image_generation",
      userId: USER_ID,
    });

    const body = await ledgerBody();

    expect(body.activities).toEqual([
      expect.objectContaining({
        amount: -40,
        task_type: "image_generation",
        title: "Pending · Image generation",
        type: "pending",
      }),
      expect.objectContaining({
        amount: 40,
        task_type: "image_generation",
        title: "Released · Image generation",
        type: "released",
      }),
      expect.any(Object),
    ]);
  });

  it("finds the reserve amount when only the settlement is in the raw ledger page", async () => {
    await grantTestCredits(1_000, 1_000);
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const reservation = await reserveCredits(env, {
      amount: 40,
      referenceId: "image-1",
      referenceType: "image_job",
      taskType: "image_generation",
      userId: USER_ID,
    });
    vi.setSystemTime(3_000);
    await commitReservation(env, reservation.reservation_id);

    const body = await ledgerBody("limit=1");

    expect(body.entries).toEqual([
      expect.objectContaining({ amount: 0, task_type: "image_generation", type: "commit" }),
    ]);
    expect(body.activities).toEqual([
      expect.objectContaining({
        amount: -40,
        task_type: "image_generation",
        title: "Spent · Image generation",
        type: "spent",
      }),
    ]);
  });

  it("returns readable activities for direct credit ledger entries", async () => {
    await grantTestCredits(1_000, 1_000);
    await grantCredits(env, {
      amount: 30_000,
      now: 2_000,
      referenceId: `${USER_ID}:pro:2026-06`,
      referenceType: "monthly_grant",
      userId: USER_ID,
    });
    await recordPurchase(env, {
      credits: 5_000,
      now: 3_000,
      packageId: "small",
      paymentId: "pi_1",
      sessionId: "cs_1",
      userId: USER_ID,
    });
    await refundCredits(env, {
      amount: 7,
      reason: "test_refund",
      referenceId: "refund-1",
      referenceType: "manual_refund",
      userId: USER_ID,
    });
    await adjustCredits(env, {
      adminId: "admin-1",
      amount: 5,
      reason: "test_adjustment",
      userId: USER_ID,
    });
    env.__credits.__state.ledger.push({
      amount: -2,
      balance_after: 36_010,
      created_at: 4_000,
      expires_at: null,
      id: "expire-1",
      metadata: null,
      reference_id: "expire-1",
      reference_type: "expiry",
      reserved_after: 0,
      stripe_payment_id: null,
      stripe_session_id: null,
      task_type: null,
      type: "expire",
      user_id: USER_ID,
    });

    const body = await ledgerBody();
    const activityTitles = body.activities.map((activity) => `${activity.title} ${activity.amount}`);

    expect(activityTitles).toEqual(
      expect.arrayContaining([
        "Signup credits 1000",
        "Monthly credits 30000",
        "Credit purchase 5000",
        "Refund 7",
        "Adjustment 5",
        "Expired -2",
      ]),
    );
  });
});

async function grantTestCredits(amount: number, now: number): Promise<void> {
  await grantCredits(env, {
    amount,
    now,
    referenceId: `${USER_ID}:signup`,
    referenceType: "signup_grant",
    userId: USER_ID,
  });
}

async function ledgerBody(query = ""): Promise<{
  activities: CreditActivityEntry[];
  entries: Array<{ amount: number; task_type: string | null; type: string }>;
}> {
  const url = query ? `http://api/credits/ledger?${query}` : "http://api/credits/ledger";
  const res = await handleCreditsRequest(
    new Request(url, { headers: await authHeaders(env) }),
    env,
    "/credits/ledger",
  );
  expect(res?.status).toBe(200);
  return res!.json();
}
