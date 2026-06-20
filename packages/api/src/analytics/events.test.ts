import { describe, expect, it } from "vitest";

import { createKvStore, createSessionsStore, createUsersStore } from "../auth/test-fixtures";
import { signSession } from "../auth/session";
import type { AuthEnv } from "../auth/types";
import { cleanupOldAnalyticsEvents, handleAnalyticsRequest } from "./events";

const USER_ID = "user-1";
const USER_EMAIL = "member@example.com";
const NOW = Date.now();

type AnalyticsRow = {
  anonymous_id: string;
  event_name: string;
  properties_json: string;
  received_at: number;
  user_id: string | null;
};

function createEnv() {
  const rows: AnalyticsRow[] = [];
  const usersStore = createUsersStore();
  const sessionsStore = createSessionsStore();
  const kvStore = createKvStore();

  usersStore.seed({
    id: USER_ID,
    email: USER_EMAIL,
    email_verified: 1,
    display_name: "Member",
    created_at: NOW,
    last_seen_at: NOW,
  });

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return statement(sql, values, rows, sessionsStore);
        },
        ...statement(sql, [], rows, sessionsStore),
      };
    },
  };

  const env = {
    APP_ENV: "dev" as const,
    AUTH_TOKEN_SECRET: "test-auth-secret",
    CONFIG: kvStore.asKV(),
    DB: db,
  } as unknown as AuthEnv;

  return { env: env as unknown as Env, rows };
}

function statement(
  sql: string,
  values: unknown[],
  rows: AnalyticsRow[],
  sessionsStore: ReturnType<typeof createSessionsStore>,
) {
  return {
    async all<T>() {
      if (sql.includes("SELECT key, value FROM app_settings")) {
        return { results: [] as T[] };
      }
      return { results: [] as T[] };
    },
    async first<T>() {
      const sessionResult = sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "first") return sessionResult.result as T | null;
      return null;
    },
    async run() {
      const sessionResult = sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "run") return sessionResult.result;

      if (sql.includes("INSERT INTO analytics_events")) {
        const [
          ,
          eventName,
          anonymousId,
          userId,
          ,
          ,
          receivedAt,
          ,
          propertiesJson,
        ] = values as [string, string, string, string | null, string | null, number, number, string | null, string];
        rows.push({
          anonymous_id: anonymousId,
          event_name: eventName,
          properties_json: propertiesJson,
          received_at: receivedAt,
          user_id: userId,
        });
        return { meta: { changes: 1 } };
      }

      if (sql.includes("DELETE FROM analytics_events WHERE received_at < ?")) {
        const [cutoff] = values as [number];
        const before = rows.length;
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          if (rows[index]!.received_at < cutoff) rows.splice(index, 1);
        }
        return { meta: { changes: before - rows.length } };
      }

      return { meta: { changes: 0 } };
    },
  };
}

function eventRequest(body: unknown, token?: string): Request {
  return new Request("https://api.test/analytics/events", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    method: "POST",
  });
}

describe("handleAnalyticsRequest", () => {
  it("accepts anonymous web events", async () => {
    const { env, rows } = createEnv();

    const response = await handleAnalyticsRequest(
      eventRequest({
        events: [{
          anonymous_id: "anon-1",
          event_name: "discover_search_performed",
          occurred_at: NOW,
          properties: {
            gender: "female",
            has_query: true,
            query_length: 8,
            result_count: 3,
          },
        }],
      }),
      env,
      "/analytics/events",
    );

    expect(response?.status).toBe(202);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      anonymous_id: "anon-1",
      event_name: "discover_search_performed",
      user_id: null,
    });
    expect(JSON.parse(rows[0]!.properties_json)).not.toHaveProperty("query");
  });

  it("binds user_id when a valid auth token is present", async () => {
    const { env, rows } = createEnv();
    const session = await signSession(env as unknown as AuthEnv, { email: USER_EMAIL, userId: USER_ID, now: NOW });

    const response = await handleAnalyticsRequest(
      eventRequest({
        event: {
          anonymous_id: "anon-2",
          event_name: "billing_checkout_started",
          occurred_at: NOW,
          properties: { checkout_type: "subscription", surface: "billing" },
        },
      }, session.token),
      env,
      "/analytics/events",
    );

    expect(response?.status).toBe(202);
    expect(rows[0]?.user_id).toBe(USER_ID);
  });

  it("rejects forbidden or unknown properties", async () => {
    const { env, rows } = createEnv();

    const response = await handleAnalyticsRequest(
      eventRequest({
        event: {
          anonymous_id: "anon-3",
          event_name: "discover_search_performed",
          occurred_at: NOW,
          properties: { query: "private search text" },
        },
      }),
      env,
      "/analytics/events",
    );

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({ error: "invalid_event_payload" });
    expect(rows).toHaveLength(0);
  });

  it("accepts landing CTA events with variant metadata", async () => {
    const { env, rows } = createEnv();

    const response = await handleAnalyticsRequest(
      eventRequest({
        event: {
          anonymous_id: "anon-landing",
          event_name: "landing_cta_clicked",
          occurred_at: NOW,
          properties: {
            cta_id: "explore_companions",
            destination: "/",
            landing_variant: "city",
          },
        },
      }),
      env,
      "/analytics/events",
    );

    expect(response?.status).toBe(202);
    expect(rows[0]?.event_name).toBe("landing_cta_clicked");
    expect(JSON.parse(rows[0]!.properties_json)).toEqual({
      cta_id: "explore_companions",
      destination: "/",
      landing_variant: "city",
    });
  });

  it("accepts landing variant metadata on page views", async () => {
    const { env, rows } = createEnv();

    const response = await handleAnalyticsRequest(
      eventRequest({
        event: {
          anonymous_id: "anon-page",
          event_name: "web_page_viewed",
          occurred_at: NOW,
          properties: {
            landing_variant: "creator",
            path_template: "/landing",
            route_name: "Landing",
          },
        },
      }),
      env,
      "/analytics/events",
    );

    expect(response?.status).toBe(202);
    expect(JSON.parse(rows[0]!.properties_json)).toMatchObject({
      landing_variant: "creator",
      path_template: "/landing",
      route_name: "Landing",
    });
  });

  it("cleans up analytics rows older than 180 days", async () => {
    const { env, rows } = createEnv();
    rows.push(
      {
        anonymous_id: "old",
        event_name: "web_page_viewed",
        properties_json: "{}",
        received_at: NOW - 181 * 24 * 60 * 60 * 1000,
        user_id: null,
      },
      {
        anonymous_id: "fresh",
        event_name: "web_page_viewed",
        properties_json: "{}",
        received_at: NOW - 10 * 24 * 60 * 60 * 1000,
        user_id: null,
      },
    );

    await cleanupOldAnalyticsEvents(env, NOW);

    expect(rows.map((row) => row.anonymous_id)).toEqual(["fresh"]);
  });
});
