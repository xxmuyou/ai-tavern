import { describe, expect, it } from "vitest";

import { handleAuthRequest } from "../auth";
import { createSessionsStore, type SessionsStore } from "../auth/test-fixtures";
import { handleRelationshipsRequest } from "./index";

type CompanionRow = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
};

type RelationshipFixture = {
  user_id: string;
  companion_id: string;
  closeness?: number;
  trust?: number;
  romance?: number;
  friendship?: number;
  hostility?: number;
  tension?: number;
  distance?: number;
  level_label?: string;
  first_met_at: number;
  last_interaction_at: number;
};

describe("relationships GET endpoint", () => {
  it("rejects unauthenticated request with 401", async () => {
    const env = createEnv({ companions: [], relationships: [] });
    await expect(
      handleRelationshipsRequest(
        new Request("http://localhost/relationships/maya"),
        env,
        "/relationships/maya",
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("returns 404 for unknown companion", async () => {
    const env = createEnv({ companions: [], relationships: [] });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleRelationshipsRequest(
      authedRequest("http://localhost/relationships/missing", token),
      env,
      "/relationships/missing",
    );
    expect(response?.status).toBe(404);
  });

  it("returns Stranger + zeros + empty milestones when no relationship row exists", async () => {
    const env = createEnv({
      companions: [{ created_by: null, id: "maya", is_active: 1, source: "official" }],
      relationships: [],
    });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleRelationshipsRequest(
      authedRequest("http://localhost/relationships/maya", token),
      env,
      "/relationships/maya",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      companion_id: string;
      level: string;
      dimensions: Record<string, number>;
      first_met_at: number | null;
      last_interaction_at: number | null;
      milestones: Array<{ type: string; at: number }>;
    };
    expect(body.companion_id).toBe("maya");
    expect(body.level).toBe("Stranger");
    expect(body.first_met_at).toBeNull();
    expect(body.last_interaction_at).toBeNull();
    expect(body.dimensions.closeness).toBe(0);
    expect(body.milestones).toEqual([]);
  });

  it("returns dimensions + level + first_met milestone when relationship exists", async () => {
    const env = createEnv({
      companions: [{ created_by: null, id: "maya", is_active: 1, source: "official" }],
      relationships: [
        {
          closeness: 50,
          companion_id: "maya",
          distance: 5,
          first_met_at: 1747000000000,
          friendship: 40,
          last_interaction_at: 1747700000000,
          level_label: "Friend",
          romance: 0,
          tension: 0,
          trust: 0,
          user_id: "user-1",
        },
      ],
    });

    const token = await issueDevToken(env, "player@example.com");
    const response = await handleRelationshipsRequest(
      authedRequest("http://localhost/relationships/maya", token),
      env,
      "/relationships/maya",
    );

    const body = (await response?.json()) as {
      level: string;
      dimensions: Record<string, number>;
      first_met_at: number;
      milestones: Array<{ type: string; at: number }>;
    };
    expect(body.level).toBe("Friend"); // computed from dimensions, not read from stored level_label
    expect(body.dimensions.closeness).toBe(50);
    expect(body.dimensions.friendship).toBe(40);
    expect(body.first_met_at).toBe(1747000000000);
    expect(body.milestones).toEqual([{ at: 1747000000000, type: "first_met" }]);
  });

  it("returns 404 for another user's private companion (no info leak)", async () => {
    const env = createEnv({
      companions: [{ created_by: "user-2", id: "secret", is_active: 1, source: "user" }],
      relationships: [],
      users: [
        { email: "player@example.com", id: "user-1" },
        { email: "other@example.com", id: "user-2" },
      ],
    });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleRelationshipsRequest(
      authedRequest("http://localhost/relationships/secret", token),
      env,
      "/relationships/secret",
    );
    expect(response?.status).toBe(404);
  });
});

// -----------------------------------------------------------------------------
// Helpers / mock
// -----------------------------------------------------------------------------

async function issueDevToken(env: Env, email: string): Promise<string> {
  const response = await handleAuthRequest(
    new Request("http://localhost/auth/dev-session", {
      body: JSON.stringify({ email }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    env,
    "/auth/dev-session",
  );
  if (!response) throw new Error("auth handler returned null");
  const payload = (await response.json()) as { token: string };
  return payload.token;
}

function authedRequest(url: string, token: string): Request {
  return new Request(url, {
    headers: { authorization: `Bearer ${token}` },
  });
}

function createEnv(fixtures: {
  companions: CompanionRow[];
  relationships: RelationshipFixture[];
  users?: Array<{ id: string; email: string }>;
}): Env {
  const users = new Map<string, { id: string; email: string }>();
  const seed = fixtures.users ?? [{ email: "player@example.com", id: "user-1" }];
  for (const u of seed) users.set(u.email, u);

  const companions = new Map<string, CompanionRow>();
  for (const c of fixtures.companions) companions.set(c.id, { ...c });

  const relationships = fixtures.relationships.map((r) => ({ ...r }));
  const sessionsStore = createSessionsStore();

  return {
    APP_ENV: "dev",
    AUTH_TOKEN_SECRET: "test-auth-secret",
    DB: {
      prepare(sql: string) {
        return buildStatement(sql, users, companions, relationships, sessionsStore);
      },
    },
  } as unknown as Env;
}

function buildStatement(
  sql: string,
  users: Map<string, { id: string; email: string }>,
  companions: Map<string, CompanionRow>,
  relationships: RelationshipFixture[],
  sessionsStore: SessionsStore,
) {
  const exec = (values: unknown[]) => ({
    async first<T>(): Promise<T | null> {
      const sessionResult = sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "first") {
        return sessionResult.result as unknown as T | null;
      }
      if (sql.includes("FROM users")) {
        if (sql.includes("WHERE email = ?")) return (users.get(values[0] as string) ?? null) as T | null;
        if (sql.includes("WHERE id = ?")) {
          return ([...users.values()].find((u) => u.id === values[0]) ?? null) as T | null;
        }
      }
      if (sql.includes("FROM companions") && sql.includes("WHERE id = ?")) {
        return (companions.get(values[0] as string) ?? null) as T | null;
      }
      if (sql.includes("FROM relationships") && sql.includes("WHERE user_id = ? AND companion_id = ?")) {
        const [userId, companionId] = values as [string, string];
        return (relationships.find((r) => r.user_id === userId && r.companion_id === companionId) ??
          null) as T | null;
      }
      return null;
    },
    async all<T>(): Promise<{ results: T[] }> {
      return { results: [] };
    },
    async run() {
      const sessionResult = sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "run") {
        return sessionResult.result;
      }
      if (sql.includes("INSERT OR IGNORE INTO users")) {
        const [id, email] = values as [string, string];
        if (id && email && !users.has(email)) users.set(email, { email, id });
      }
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
