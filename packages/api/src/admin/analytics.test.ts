import { beforeEach, describe, expect, it } from "vitest";

import { signSession } from "../auth/session";
import {
  createIdentitiesStore,
  createKvStore,
  createSessionsStore,
  createUsersStore,
  type UserFixture,
  type UsersStore,
} from "../auth/test-fixtures";
import type { AuthEnv } from "../auth/types";
import { handleAdminAnalyticsRequest } from "./analytics";

const ADMIN_EMAIL = "admin@xtbit.test";
const ADMIN_ID = "admin-1";
const USER_ID = "user-1";
const USER_EMAIL = "member@example.com";
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

type SubscriptionFixture = {
  id: string;
  user_id: string;
  status: string;
  current_period_end: number;
  updated_at: number;
};

type TestEnv = AuthEnv & {
  subscriptions: SubscriptionFixture[];
  usersStore: UsersStore;
};

function createEnv(options: {
  users?: UserFixture[];
  subscriptions?: SubscriptionFixture[];
  stripeSecretKey?: string;
  proMonthlyPriceId?: string;
} = {}): TestEnv {
  const usersStore = createUsersStore();
  const sessionsStore = createSessionsStore();
  const identitiesStore = createIdentitiesStore();
  const kvStore = createKvStore();
  const subscriptions = [...(options.subscriptions ?? [])];

  usersStore.seed({
    id: ADMIN_ID,
    email: ADMIN_EMAIL,
    email_verified: 1,
    display_name: "Admin",
    created_at: Date.UTC(2026, 4, 1, 0, 0, 0),
    last_seen_at: NOW - (60 * 60 * 1000),
  });

  usersStore.seed({
    id: USER_ID,
    email: USER_EMAIL,
    email_verified: 1,
    display_name: "Member",
    created_at: Date.UTC(2026, 5, 15, 8, 0, 0),
    last_seen_at: NOW - (30 * 60 * 1000),
  });

  for (const user of options.users ?? []) {
    usersStore.seed(user);
  }

  const db = {
    prepare(sql: string) {
      return buildStatement(sql, {
        identitiesStore,
        proMonthlyPriceId: options.proMonthlyPriceId ?? "price_pro_monthly",
        sessionsStore,
        subscriptions,
        usersStore,
      });
    },
  };

  return {
    ADMIN_EMAILS: ADMIN_EMAIL,
    APP_ENV: "dev" as const,
    AUTH_TOKEN_SECRET: "test-auth-secret",
    CONFIG: kvStore.asKV(),
    DB: db,
    STRIPE_SECRET_KEY: options.stripeSecretKey ?? "sk_test_123",
    subscriptions,
    usersStore,
  } as unknown as TestEnv;
}

function buildStatement(
  sql: string,
  stores: {
    identitiesStore: ReturnType<typeof createIdentitiesStore>;
    proMonthlyPriceId: string;
    sessionsStore: ReturnType<typeof createSessionsStore>;
    subscriptions: SubscriptionFixture[];
    usersStore: UsersStore;
  },
) {
  const exec = (values: unknown[]) => ({
    async first<T>(): Promise<T | null> {
      if (sql.includes("COUNT(*) AS total_users")) {
        return { total_users: stores.usersStore.list().length } as T;
      }
      if (sql.includes("COUNT(*) AS new_users")) {
        const [fromMs, toMs] = values as [number, number];
        return {
          new_users: stores.usersStore
            .list()
            .filter((user) => user.created_at >= fromMs && user.created_at < toMs).length,
        } as T;
      }
      if (sql.includes("COUNT(*) AS active_users")) {
        const [fromMs] = values as [number];
        return {
          active_users: stores.usersStore
            .list()
            .filter((user) => user.last_seen_at >= fromMs).length,
        } as T;
      }
      if (sql.includes("FROM admin_user_allowlist")) {
        return null;
      }
      const userResult = stores.usersStore.handle(sql, values);
      if (userResult?.kind === "first") return userResult.result as T | null;
      const identityResult = stores.identitiesStore.handle(sql, values);
      if (identityResult?.kind === "first") return identityResult.result as T | null;
      const sessionResult = stores.sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "first") return sessionResult.result as T | null;
      return null;
    },
    async all<T>(): Promise<{ results: T[] }> {
      if (sql.includes("SELECT key, value FROM app_settings")) {
        return {
          results: [
            { key: "billing.pro_monthly_price", value: stores.proMonthlyPriceId },
          ] as T[],
        };
      }
      if (sql.includes("CASE WHEN active_sub.user_id IS NULL THEN 'free' ELSE 'pro' END AS tier")) {
        const [now] = values as [number];
        const active = activeSubscriptionUserIds(stores.subscriptions, now);
        const counts = new Map<"free" | "pro", number>([
          ["free", 0],
          ["pro", 0],
        ]);
        for (const user of stores.usersStore.list()) {
          const tier = active.has(user.id) ? "pro" : "free";
          counts.set(tier, (counts.get(tier) ?? 0) + 1);
        }
        return {
          results: [
            { tier: "free", count: counts.get("free") ?? 0 },
            { tier: "pro", count: counts.get("pro") ?? 0 },
          ] as unknown as T[],
        };
      }
      if (sql.includes("SELECT status, COUNT(*) AS count") && sql.includes("FROM ranked")) {
        const grouped = new Map<string, number>();
        for (const subscription of latestSubscriptionsByUser(stores.subscriptions)) {
          grouped.set(subscription.status, (grouped.get(subscription.status) ?? 0) + 1);
        }
        return {
          results: [...grouped.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([status, count]) => ({ status, count })) as unknown as T[],
        };
      }
      if (sql.includes("date(created_at / 1000, 'unixepoch') AS date_utc")) {
        const [fromMs, toMs] = values as [number, number];
        const grouped = new Map<string, number>();
        for (const user of stores.usersStore.list()) {
          if (user.created_at < fromMs || user.created_at >= toMs) continue;
          const date = utcDate(user.created_at);
          grouped.set(date, (grouped.get(date) ?? 0) + 1);
        }
        return {
          results: [...grouped.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date_utc, users]) => ({ date_utc, users })) as unknown as T[],
        };
      }
      if (sql.includes("ORDER BY u.created_at DESC, u.id DESC") && sql.includes("latest_subscription AS")) {
        const now = values[0] as number;
        const hasCursor = values.length === 5;
        const cursorCreatedAt = hasCursor ? (values[1] as number) : null;
        const cursorUserId = hasCursor ? (values[3] as string) : null;
        const limit = values[values.length - 1] as number;
        const active = activeSubscriptionUserIds(stores.subscriptions, now);
        const latest = latestSubscriptionMap(stores.subscriptions);

        const rows = stores.usersStore
          .list()
          .filter((user) => {
            if (cursorCreatedAt === null || cursorUserId === null) return true;
            return user.created_at < cursorCreatedAt
              || (user.created_at === cursorCreatedAt && user.id < cursorUserId);
          })
          .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))
          .slice(0, limit)
          .map((user) => ({
            user_id: user.id,
            email: user.email,
            created_at: user.created_at,
            last_seen_at: user.last_seen_at,
            tier: active.has(user.id) ? "pro" : "free",
            subscription_status: latest.get(user.id)?.status ?? null,
          }));

        return { results: rows as unknown as T[] };
      }
      const identityResult = stores.identitiesStore.handle(sql, values);
      if (identityResult?.kind === "all") {
        return { results: identityResult.result as unknown as T[] };
      }
      return { results: [] };
    },
    async run() {
      const userResult = stores.usersStore.handle(sql, values);
      if (userResult?.kind === "run") return userResult.result;
      const identityResult = stores.identitiesStore.handle(sql, values);
      if (identityResult?.kind === "run") return identityResult.result;
      const sessionResult = stores.sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "run") return sessionResult.result;
      return { meta: { changes: 1 } };
    },
  });

  return {
    ...exec([]),
    bind(...values: unknown[]) {
      return exec(values);
    },
  };
}

async function adminHeaders(env: TestEnv): Promise<Record<string, string>> {
  const session = await signSession(env, { userId: ADMIN_ID, email: ADMIN_EMAIL });
  return { authorization: `Bearer ${session.token}` };
}

async function nonAdminHeaders(env: TestEnv): Promise<Record<string, string>> {
  const session = await signSession(env, { userId: USER_ID, email: USER_EMAIL });
  return { authorization: `Bearer ${session.token}` };
}

function activeSubscriptionUserIds(subscriptions: SubscriptionFixture[], now: number): Set<string> {
  return new Set(
    subscriptions
      .filter((subscription) => (
        (subscription.status === "active" || subscription.status === "trialing")
        && subscription.current_period_end > now
      ))
      .map((subscription) => subscription.user_id),
  );
}

function latestSubscriptionsByUser(subscriptions: SubscriptionFixture[]): SubscriptionFixture[] {
  return [...latestSubscriptionMap(subscriptions).values()];
}

function latestSubscriptionMap(subscriptions: SubscriptionFixture[]): Map<string, SubscriptionFixture> {
  const map = new Map<string, SubscriptionFixture>();
  for (const subscription of subscriptions) {
    const existing = map.get(subscription.user_id);
    if (!existing) {
      map.set(subscription.user_id, subscription);
      continue;
    }
    if (
      subscription.current_period_end > existing.current_period_end
      || (
        subscription.current_period_end === existing.current_period_end
        && (
          subscription.updated_at > existing.updated_at
          || (
            subscription.updated_at === existing.updated_at
            && subscription.id > existing.id
          )
        )
      )
    ) {
      map.set(subscription.user_id, subscription);
    }
  }
  return map;
}

function utcDate(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

let env: TestEnv;

beforeEach(() => {
  env = createEnv();
});

describe("admin analytics auth", () => {
  it("returns 401 without a token", async () => {
    const res = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/analytics/overview"),
      env,
      "/admin/analytics/overview",
      { now: () => NOW },
    );

    expect(res?.status).toBe(401);
    expect(((await res!.json()) as { error: string }).error).toBe("auth_required");
  });

  it("returns 403 for a non-admin user", async () => {
    const res = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/analytics/overview", {
        headers: await nonAdminHeaders(env),
      }),
      env,
      "/admin/analytics/overview",
      { now: () => NOW },
    );

    expect(res?.status).toBe(403);
    expect(((await res!.json()) as { error: string }).error).toBe("admin_required");
  });

  it("returns 405 for an unsupported method", async () => {
    const res = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/analytics/overview", {
        method: "POST",
        headers: await adminHeaders(env),
      }),
      env,
      "/admin/analytics/overview",
      { now: () => NOW },
    );

    expect(res?.status).toBe(405);
  });
});

describe("GET /admin/analytics/overview", () => {
  it("returns 400 for an invalid window", async () => {
    const res = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/analytics/overview?window=90d", {
        headers: await adminHeaders(env),
      }),
      env,
      "/admin/analytics/overview",
      { now: () => NOW },
    );

    expect(res?.status).toBe(400);
    expect(((await res!.json()) as { error: string }).error).toBe("invalid_window");
  });

  it("aggregates user, membership, revenue, and trend data", async () => {
    env = createEnv({
      users: [
        {
          id: "user-2",
          email: "free-1@example.com",
          email_verified: 1,
          display_name: "Free 1",
          created_at: Date.UTC(2026, 5, 14, 10, 0, 0),
          last_seen_at: NOW - (2 * 24 * 60 * 60 * 1000),
        },
        {
          id: "user-3",
          email: "free-2@example.com",
          email_verified: 1,
          display_name: "Free 2",
          created_at: Date.UTC(2026, 5, 10, 9, 0, 0),
          last_seen_at: NOW - (10 * 24 * 60 * 60 * 1000),
        },
        {
          id: "user-4",
          email: "pro-2@example.com",
          email_verified: 1,
          display_name: "Pro 2",
          created_at: Date.UTC(2026, 4, 20, 9, 0, 0),
          last_seen_at: NOW - (20 * 24 * 60 * 60 * 1000),
        },
      ],
      subscriptions: [
        {
          id: "sub-active-1",
          user_id: USER_ID,
          status: "active",
          current_period_end: NOW + (10 * 24 * 60 * 60 * 1000),
          updated_at: NOW - 1000,
        },
        {
          id: "sub-canceled-1",
          user_id: "user-2",
          status: "canceled",
          current_period_end: NOW - (24 * 60 * 60 * 1000),
          updated_at: NOW - 2000,
        },
        {
          id: "sub-pastdue-1",
          user_id: "user-3",
          status: "past_due",
          current_period_end: NOW - (2 * 24 * 60 * 60 * 1000),
          updated_at: NOW - 3000,
        },
        {
          id: "sub-active-2",
          user_id: "user-4",
          status: "active",
          current_period_end: NOW + (5 * 24 * 60 * 60 * 1000),
          updated_at: NOW - 4000,
        },
      ],
    });

    const res = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/analytics/overview?window=7d", {
        headers: await adminHeaders(env),
      }),
      env,
      "/admin/analytics/overview",
      {
        now: () => NOW,
        createStripeClient: () => ({}) as never,
        listCreditsRevenueSessions: async () => [
          {
            id: "cs_1",
            created: Math.floor(Date.UTC(2026, 5, 15, 1, 0, 0) / 1000),
            amount_total: 500,
            payment_status: "paid",
            metadata: { credit_package: "small" },
          },
          {
            id: "cs_2",
            created: Math.floor(Date.UTC(2026, 5, 14, 5, 0, 0) / 1000),
            amount_total: 2500,
            payment_status: "paid",
            metadata: { credit_package: "medium" },
          },
          {
            id: "cs_ignored",
            created: Math.floor(Date.UTC(2026, 5, 13, 5, 0, 0) / 1000),
            amount_total: 700,
            payment_status: "paid",
            metadata: {},
          },
        ],
        listSubscriptionRevenueInvoices: async () => [
          {
            id: "in_1",
            created: Math.floor(Date.UTC(2026, 5, 14, 3, 0, 0) / 1000),
            amount_paid: 900,
            lines: { data: [{ price: { id: "price_pro_monthly" } }] },
          },
          {
            id: "in_2",
            created: Math.floor(Date.UTC(2026, 5, 10, 7, 0, 0) / 1000),
            amount_paid: 900,
            lines: { data: [{ price: { id: "price_pro_monthly" } }] },
          },
          {
            id: "in_ignored",
            created: Math.floor(Date.UTC(2026, 5, 14, 9, 0, 0) / 1000),
            amount_paid: 1200,
            lines: { data: [{ price: { id: "price_other" } }] },
          },
        ],
      },
    );

    expect(res?.status).toBe(200);
    const body = (await res!.json()) as {
      window: string;
      from: string;
      to: string;
      summary: Record<string, number>;
      tier_breakdown: Array<{ tier: string; count: number }>;
      subscription_status_breakdown: Array<{ status: string; count: number }>;
      signups_by_day: Array<{ date_utc: string; users: number }>;
      revenue_by_day: Array<{
        date_utc: string;
        credits_revenue_usd: number;
        subscription_revenue_usd: number;
        gross_revenue_usd: number;
      }>;
      recent_signups: Array<{ user_id: string }>;
      revenue_status: { available: boolean; message: string | null };
    };

    expect(body.window).toBe("7d");
    expect(body.from).toBe("2026-06-09T00:00:00.000Z");
    expect(body.to).toBe("2026-06-15T12:00:00.000Z");
    expect(body.summary).toEqual({
      total_users: 5,
      new_users: 3,
      active_users: 3,
      pro_users: 2,
      free_users: 3,
      active_subscriptions: 2,
      credits_revenue_usd: 30,
      subscription_revenue_usd: 18,
      gross_revenue_usd: 48,
    });
    expect(body.tier_breakdown).toEqual([
      { tier: "free", count: 3 },
      { tier: "pro", count: 2 },
    ]);
    expect(body.subscription_status_breakdown).toEqual([
      { status: "active", count: 2 },
      { status: "canceled", count: 1 },
      { status: "past_due", count: 1 },
    ]);
    expect(body.recent_signups.map((user) => user.user_id)).toEqual([
      USER_ID,
      "user-2",
      "user-3",
      "user-4",
      ADMIN_ID,
    ]);
    expect(body.signups_by_day).toEqual([
      { date_utc: "2026-06-09", users: 0 },
      { date_utc: "2026-06-10", users: 1 },
      { date_utc: "2026-06-11", users: 0 },
      { date_utc: "2026-06-12", users: 0 },
      { date_utc: "2026-06-13", users: 0 },
      { date_utc: "2026-06-14", users: 1 },
      { date_utc: "2026-06-15", users: 1 },
    ]);
    expect(body.revenue_by_day).toEqual([
      {
        date_utc: "2026-06-09",
        credits_revenue_usd: 0,
        subscription_revenue_usd: 0,
        gross_revenue_usd: 0,
      },
      {
        date_utc: "2026-06-10",
        credits_revenue_usd: 0,
        subscription_revenue_usd: 9,
        gross_revenue_usd: 9,
      },
      {
        date_utc: "2026-06-11",
        credits_revenue_usd: 0,
        subscription_revenue_usd: 0,
        gross_revenue_usd: 0,
      },
      {
        date_utc: "2026-06-12",
        credits_revenue_usd: 0,
        subscription_revenue_usd: 0,
        gross_revenue_usd: 0,
      },
      {
        date_utc: "2026-06-13",
        credits_revenue_usd: 0,
        subscription_revenue_usd: 0,
        gross_revenue_usd: 0,
      },
      {
        date_utc: "2026-06-14",
        credits_revenue_usd: 25,
        subscription_revenue_usd: 9,
        gross_revenue_usd: 34,
      },
      {
        date_utc: "2026-06-15",
        credits_revenue_usd: 5,
        subscription_revenue_usd: 0,
        gross_revenue_usd: 5,
      },
    ]);
    expect(body.revenue_status).toEqual({ available: true, message: null });
  });

  it("uses correct boundaries for today, 7d, and 30d", async () => {
    env = createEnv({
      users: [
        {
          id: "user-2",
          email: "window-2@example.com",
          email_verified: 1,
          display_name: "Window 2",
          created_at: Date.UTC(2026, 5, 9, 0, 0, 0),
          last_seen_at: NOW - (6 * 24 * 60 * 60 * 1000),
        },
        {
          id: "user-3",
          email: "window-3@example.com",
          email_verified: 1,
          display_name: "Window 3",
          created_at: Date.UTC(2026, 4, 17, 0, 0, 0),
          last_seen_at: NOW - (29 * 24 * 60 * 60 * 1000),
        },
        {
          id: "user-4",
          email: "window-4@example.com",
          email_verified: 1,
          display_name: "Window 4",
          created_at: Date.UTC(2026, 4, 16, 23, 59, 59),
          last_seen_at: NOW - (31 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    const windows = await Promise.all(
      ["today", "7d", "30d"].map(async (window) => {
        const res = await handleAdminAnalyticsRequest(
          new Request(`http://api/admin/analytics/overview?window=${window}`, {
            headers: await adminHeaders(env),
          }),
          env,
          "/admin/analytics/overview",
          {
            now: () => NOW,
            createStripeClient: () => ({}) as never,
            listCreditsRevenueSessions: async () => [],
            listSubscriptionRevenueInvoices: async () => [],
          },
        );
        const body = (await res!.json()) as {
          window: string;
          from: string;
          summary: { new_users: number };
        };
        return {
          window: body.window,
          from: body.from,
          summary: { new_users: body.summary.new_users },
        };
      }),
    );

    expect(windows).toEqual([
      {
        window: "today",
        from: "2026-06-15T00:00:00.000Z",
        summary: { new_users: 1 },
      },
      {
        window: "7d",
        from: "2026-06-09T00:00:00.000Z",
        summary: { new_users: 2 },
      },
      {
        window: "30d",
        from: "2026-05-17T00:00:00.000Z",
        summary: { new_users: 3 },
      },
    ]);
  });

  it("returns zero revenue and stable empty trends when Stripe data is empty", async () => {
    const res = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/analytics/overview?window=today", {
        headers: await adminHeaders(env),
      }),
      env,
      "/admin/analytics/overview",
      {
        now: () => NOW,
        createStripeClient: () => ({}) as never,
        listCreditsRevenueSessions: async () => [],
        listSubscriptionRevenueInvoices: async () => [],
      },
    );

    expect(res?.status).toBe(200);
    const body = (await res!.json()) as {
      summary: {
        credits_revenue_usd: number;
        subscription_revenue_usd: number;
        gross_revenue_usd: number;
      };
      signups_by_day: Array<{ date_utc: string; users: number }>;
      revenue_by_day: Array<{ date_utc: string; gross_revenue_usd: number }>;
      revenue_status: { available: boolean; message: string | null };
    };

    expect(body.summary.credits_revenue_usd).toBe(0);
    expect(body.summary.subscription_revenue_usd).toBe(0);
    expect(body.summary.gross_revenue_usd).toBe(0);
    expect(body.signups_by_day).toEqual([{ date_utc: "2026-06-15", users: 1 }]);
    expect(body.revenue_by_day).toEqual([
      {
        date_utc: "2026-06-15",
        credits_revenue_usd: 0,
        subscription_revenue_usd: 0,
        gross_revenue_usd: 0,
      },
    ]);
    expect(body.revenue_status).toEqual({ available: true, message: null });
  });
});

describe("GET /admin/users/list", () => {
  it("returns recent signups in descending order with default limit", async () => {
    env = createEnv({
      users: Array.from({ length: 24 }, (_, index) => ({
        id: `user-${index + 2}`,
        email: `recent-${index + 2}@example.com`,
        email_verified: 1,
        display_name: `Recent ${index + 2}`,
        created_at: NOW - ((index + 1) * 60_000),
        last_seen_at: NOW - ((index + 1) * 60_000),
      })),
    });

    const res = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/users/list", {
        headers: await adminHeaders(env),
      }),
      env,
      "/admin/users/list",
      { now: () => NOW },
    );

    expect(res?.status).toBe(200);
    const body = (await res!.json()) as {
      items: Array<{ user_id: string }>;
      next_cursor: string | null;
      sort: string;
    };

    expect(body.sort).toBe("recent_signup");
    expect(body.items).toHaveLength(20);
    expect(body.items[0]?.user_id).toBe("user-2");
    expect(body.items[1]?.user_id).toBe("user-3");
    expect(body.next_cursor).toBeTruthy();
  });

  it("caps limit and paginates without duplicates or gaps", async () => {
    env = createEnv({
      users: Array.from({ length: 120 }, (_, index) => ({
        id: `user-${index + 2}`,
        email: `page-${index + 2}@example.com`,
        email_verified: 1,
        display_name: `Page ${index + 2}`,
        created_at: NOW - ((index + 1) * 60_000),
        last_seen_at: NOW - ((index + 1) * 60_000),
      })),
    });

    const cappedRes = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/users/list?sort=recent_signup&limit=999", {
        headers: await adminHeaders(env),
      }),
      env,
      "/admin/users/list",
      { now: () => NOW },
    );
    const cappedBody = (await cappedRes!.json()) as {
      items: Array<{ user_id: string }>;
      next_cursor: string | null;
    };
    expect(cappedBody.items).toHaveLength(100);
    expect(cappedBody.next_cursor).toBeTruthy();

    const pageOneRes = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/users/list?sort=recent_signup&limit=2", {
        headers: await adminHeaders(env),
      }),
      env,
      "/admin/users/list",
      { now: () => NOW },
    );
    const pageOne = (await pageOneRes!.json()) as {
      items: Array<{ user_id: string }>;
      next_cursor: string | null;
    };

    const pageTwoRes = await handleAdminAnalyticsRequest(
      new Request(`http://api/admin/users/list?sort=recent_signup&limit=2&cursor=${encodeURIComponent(pageOne.next_cursor!)}`, {
        headers: await adminHeaders(env),
      }),
      env,
      "/admin/users/list",
      { now: () => NOW },
    );
    const pageTwo = (await pageTwoRes!.json()) as {
      items: Array<{ user_id: string }>;
      next_cursor: string | null;
    };

    expect(pageOne.items.map((item) => item.user_id)).toEqual(["user-2", "user-3"]);
    expect(pageTwo.items.map((item) => item.user_id)).toEqual(["user-4", "user-5"]);
    expect(new Set([...pageOne.items, ...pageTwo.items].map((item) => item.user_id)).size).toBe(4);
  });

  it("rejects invalid sort, limit, and cursor values", async () => {
    const headers = await adminHeaders(env);

    const invalidSort = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/users/list?sort=email", { headers }),
      env,
      "/admin/users/list",
      { now: () => NOW },
    );
    expect(invalidSort?.status).toBe(400);
    expect(((await invalidSort!.json()) as { error: string }).error).toBe("invalid_sort");

    const invalidLimit = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/users/list?sort=recent_signup&limit=0", { headers }),
      env,
      "/admin/users/list",
      { now: () => NOW },
    );
    expect(invalidLimit?.status).toBe(400);
    expect(((await invalidLimit!.json()) as { error: string }).error).toBe("invalid_limit");

    const invalidCursor = await handleAdminAnalyticsRequest(
      new Request("http://api/admin/users/list?sort=recent_signup&cursor=bad-data", { headers }),
      env,
      "/admin/users/list",
      { now: () => NOW },
    );
    expect(invalidCursor?.status).toBe(400);
    expect(((await invalidCursor!.json()) as { error: string }).error).toBe("invalid_cursor");
  });
});
