import { describe, expect, it } from "vitest";

import { handleAuthRequest } from "../auth";
import { handleCompanionsRequest } from "./index";

type CompanionRow = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
  name: string;
  appearance: string | null;
  personality: string | null;
  background: string | null;
  speech_style: string | null;
  relationship_role: string | null;
  preferred_scenes: string | null;
  art_url: string | null;
  initial_dims: string | null;
  created_at: number;
  updated_at: number;
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
  level_label?: string | null;
  first_met_at?: number;
  last_interaction_at?: number;
};

type Fixtures = {
  companions: CompanionRow[];
  relationships: RelationshipFixture[];
  users?: Array<{ id: string; email: string }>;
};

describe("companions module", () => {
  it("requires authentication for every endpoint", async () => {
    const env = createEnv({ companions: [], relationships: [] });
    await expect(
      handleCompanionsRequest(new Request("http://localhost/companions"), env, "/companions"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      handleCompanionsRequest(new Request("http://localhost/companions/x"), env, "/companions/x"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("lists official + own, hides other users' creations", async () => {
    const env = createEnv({
      companions: [
        officialCompanion("maya"),
        userCompanion("alex", "user-1"),
        userCompanion("private-to-other", "user-2"),
      ],
      relationships: [],
      users: [
        { email: "player@example.com", id: "user-1" },
        { email: "other@example.com", id: "user-2" },
      ],
    });

    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions", token),
      env,
      "/companions",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { items: Array<{ id: string }> };
    const ids = body.items.map((i) => i.id).sort();
    expect(ids).toEqual(["alex", "maya"]);
  });

  it("?source=user returns only own user companions", async () => {
    const env = createEnv({
      companions: [officialCompanion("maya"), userCompanion("alex", "user-1")],
      relationships: [],
    });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions?source=user", token),
      env,
      "/companions",
    );

    const body = (await response?.json()) as { items: Array<{ id: string; source: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe("alex");
    expect(body.items[0]?.source).toBe("user");
  });

  it("?source=official returns only official", async () => {
    const env = createEnv({
      companions: [officialCompanion("maya"), userCompanion("alex", "user-1")],
      relationships: [],
    });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions?source=official", token),
      env,
      "/companions",
    );

    const body = (await response?.json()) as { items: Array<{ id: string; source: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe("maya");
  });

  it("get detail returns zero dimensions when no relationship row exists", async () => {
    const env = createEnv({
      companions: [officialCompanion("maya")],
      relationships: [],
    });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions/maya", token),
      env,
      "/companions/maya",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      relationship: { dimensions: Record<string, number>; level: string | null };
    };
    expect(body.relationship.level).toBeNull();
    expect(body.relationship.dimensions).toEqual({
      closeness: 0,
      distance: 0,
      friendship: 0,
      hostility: 0,
      romance: 0,
      tension: 0,
      trust: 0,
    });
  });

  it("get detail returns relationship dimensions when present", async () => {
    const env = createEnv({
      companions: [officialCompanion("maya")],
      relationships: [
        {
          closeness: 42,
          companion_id: "maya",
          distance: 10,
          first_met_at: 1747000000000,
          friendship: 50,
          hostility: 0,
          last_interaction_at: 1747700000000,
          level_label: "Friend",
          romance: 18,
          tension: 5,
          trust: 35,
          user_id: "user-1",
        },
      ],
    });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions/maya", token),
      env,
      "/companions/maya",
    );

    const body = (await response?.json()) as {
      relationship: { dimensions: Record<string, number>; level: string | null };
    };
    expect(body.relationship.level).toBe("Friend");
    expect(body.relationship.dimensions.romance).toBe(18);
    expect(body.relationship.dimensions.closeness).toBe(42);
  });

  it("get on user's own private companion succeeds; on other user's private returns 404", async () => {
    const env = createEnv({
      companions: [userCompanion("alex", "user-1"), userCompanion("private", "user-2")],
      relationships: [],
      users: [
        { email: "player@example.com", id: "user-1" },
        { email: "other@example.com", id: "user-2" },
      ],
    });
    const token = await issueDevToken(env, "player@example.com");

    const own = await handleCompanionsRequest(
      authedRequest("http://localhost/companions/alex", token),
      env,
      "/companions/alex",
    );
    expect(own?.status).toBe(200);

    const other = await handleCompanionsRequest(
      authedRequest("http://localhost/companions/private", token),
      env,
      "/companions/private",
    );
    expect(other?.status).toBe(404);
  });

  it("POST creates a user companion and returns 201", async () => {
    const env = createEnv({ companions: [], relationships: [] });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions", token, "POST", {
        name: "Echo",
        personality: "Loyal and direct",
        relationship_role: "friend",
        preferred_scenes: ["cafe", "park"],
      }),
      env,
      "/companions",
    );

    expect(response?.status).toBe(201);
    const body = (await response?.json()) as {
      id: string;
      source: string;
      name: string;
      preferred_scenes: string[];
    };
    expect(body.source).toBe("user");
    expect(body.name).toBe("Echo");
    expect(body.preferred_scenes).toEqual(["cafe", "park"]);
    expect(body.id.length).toBeGreaterThan(0);
  });

  it("POST without name returns 400", async () => {
    const env = createEnv({ companions: [], relationships: [] });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions", token, "POST", { personality: "x" }),
      env,
      "/companions",
    );

    expect(response?.status).toBe(400);
    const body = (await response?.json()) as { error: string };
    expect(body.error).toBe("name_required");
  });

  it("POST 4th active user companion returns 402 quota_exceeded", async () => {
    const env = createEnv({
      companions: [
        userCompanion("a", "user-1"),
        userCompanion("b", "user-1"),
        userCompanion("c", "user-1"),
      ],
      relationships: [],
    });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions", token, "POST", { name: "Echo" }),
      env,
      "/companions",
    );

    expect(response?.status).toBe(402);
    const body = (await response?.json()) as { error: string; limit: number };
    expect(body.error).toBe("quota_exceeded");
    expect(body.limit).toBe(3);
  });

  it("PUT updates only owner's fields", async () => {
    const env = createEnv({
      companions: [userCompanion("alex", "user-1")],
      relationships: [],
    });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions/alex", token, "PUT", {
        personality: "Updated personality",
      }),
      env,
      "/companions/alex",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { personality: string };
    expect(body.personality).toBe("Updated personality");
  });

  it("PUT on official companion returns 403", async () => {
    const env = createEnv({
      companions: [officialCompanion("maya")],
      relationships: [],
    });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions/maya", token, "PUT", { name: "Mayhem" }),
      env,
      "/companions/maya",
    );

    expect(response?.status).toBe(403);
    const body = (await response?.json()) as { error: string };
    expect(body.error).toBe("forbidden_official");
  });

  it("PUT on other user's companion returns 403", async () => {
    const env = createEnv({
      companions: [userCompanion("foreign", "user-2")],
      relationships: [],
      users: [
        { email: "player@example.com", id: "user-1" },
        { email: "other@example.com", id: "user-2" },
      ],
    });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions/foreign", token, "PUT", { name: "Hijacked" }),
      env,
      "/companions/foreign",
    );

    expect(response?.status).toBe(403);
    const body = (await response?.json()) as { error: string };
    expect(body.error).toBe("forbidden_not_owner");
  });

  it("DELETE soft-deletes own companion and hides it from list", async () => {
    const env = createEnv({
      companions: [userCompanion("alex", "user-1")],
      relationships: [],
    });
    const token = await issueDevToken(env, "player@example.com");

    const del = await handleCompanionsRequest(
      authedRequest("http://localhost/companions/alex", token, "DELETE"),
      env,
      "/companions/alex",
    );
    expect(del?.status).toBe(204);

    const list = await handleCompanionsRequest(
      authedRequest("http://localhost/companions", token),
      env,
      "/companions",
    );
    const body = (await list?.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it("DELETE on official companion returns 403", async () => {
    const env = createEnv({
      companions: [officialCompanion("maya")],
      relationships: [],
    });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleCompanionsRequest(
      authedRequest("http://localhost/companions/maya", token, "DELETE"),
      env,
      "/companions/maya",
    );

    expect(response?.status).toBe(403);
  });
});

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

function officialCompanion(id: string): CompanionRow {
  return {
    appearance: null,
    art_url: null,
    background: null,
    created_at: 1747000000000,
    created_by: null,
    id,
    initial_dims: null,
    is_active: 1,
    name: id[0]!.toUpperCase() + id.slice(1),
    personality: null,
    preferred_scenes: null,
    relationship_role: "crush",
    source: "official",
    speech_style: null,
    updated_at: 1747000000000,
  };
}

function userCompanion(id: string, ownerId: string): CompanionRow {
  return {
    appearance: null,
    art_url: null,
    background: null,
    created_at: 1747000000000,
    created_by: ownerId,
    id,
    initial_dims: null,
    is_active: 1,
    name: id[0]!.toUpperCase() + id.slice(1),
    personality: null,
    preferred_scenes: null,
    relationship_role: "friend",
    source: "user",
    speech_style: null,
    updated_at: 1747000000000,
  };
}

// -----------------------------------------------------------------------------
// Auth + request helpers
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

function authedRequest(
  url: string,
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown,
): Request {
  const init: RequestInit = {
    headers: { authorization: `Bearer ${token}` },
    method,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  return new Request(url, init);
}

// -----------------------------------------------------------------------------
// In-memory D1 mock
// -----------------------------------------------------------------------------

function createEnv(fixtures: Fixtures): Env {
  const users = new Map<string, { id: string; email: string }>();
  const seedUsers = fixtures.users ?? [{ email: "player@example.com", id: "user-1" }];
  for (const u of seedUsers) users.set(u.email, u);

  const companions = new Map<string, CompanionRow>();
  for (const c of fixtures.companions) companions.set(c.id, { ...c });

  const relationships = fixtures.relationships.map((r) => ({ ...r }));

  return {
    APP_ENV: "dev",
    AUTH_TOKEN_SECRET: "test-auth-secret",
    DB: {
      prepare(sql: string) {
        return buildStatement(sql, companions, relationships, users);
      },
    },
  } as unknown as Env;
}

function buildStatement(
  sql: string,
  companions: Map<string, CompanionRow>,
  relationships: RelationshipFixture[],
  users: Map<string, { id: string; email: string }>,
) {
  const exec = (values: unknown[]) => ({
    async all<T>(): Promise<{ results: T[] }> {
      return { results: queryAll<T>(sql, values, companions, relationships) };
    },
    async first<T>(): Promise<T | null> {
      return queryFirst<T>(sql, values, companions, relationships, users);
    },
    async run() {
      mutate(sql, values, companions, users);
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

function queryAll<T>(
  sql: string,
  values: unknown[],
  companions: Map<string, CompanionRow>,
  relationships: RelationshipFixture[],
): T[] {
  if (sql.includes("FROM companions c") && sql.includes("LEFT JOIN relationships r")) {
    // Variants:
    //   official only: bind(userId)
    //   user only:     bind(userId, ownerId)   (companions WHERE created_by=?)
    //   all:           bind(userId, userId)    (companions WHERE source='official' OR created_by=?)
    const userId = values[0] as string;
    let rows = [...companions.values()].filter((c) => c.is_active === 1);

    if (sql.includes("c.source = 'official' AND c.is_active = 1")) {
      rows = rows.filter((c) => c.source === "official");
    } else if (sql.includes("c.source = 'user' AND c.created_by = ?")) {
      const ownerId = values[1] as string;
      rows = rows.filter((c) => c.source === "user" && c.created_by === ownerId);
    } else if (sql.includes("(c.source = 'official' OR c.created_by = ?)")) {
      const ownerId = values[1] as string;
      rows = rows.filter((c) => c.source === "official" || c.created_by === ownerId);
    }

    rows.sort((a, b) => a.created_at - b.created_at);

    return rows.map((c) => {
      const rel = relationships.find((r) => r.companion_id === c.id && r.user_id === userId);
      return {
        ...c,
        last_interaction_at: rel?.last_interaction_at ?? null,
        level_label: rel?.level_label ?? null,
      };
    }) as unknown as T[];
  }

  return [];
}

function queryFirst<T>(
  sql: string,
  values: unknown[],
  companions: Map<string, CompanionRow>,
  relationships: RelationshipFixture[],
  users: Map<string, { id: string; email: string }>,
): T | null {
  if (sql.includes("FROM users")) {
    if (sql.includes("WHERE email = ?")) {
      return (users.get(values[0] as string) ?? null) as T | null;
    }
    if (sql.includes("WHERE id = ?")) {
      return ([...users.values()].find((u) => u.id === values[0]) ?? null) as T | null;
    }
  }

  if (sql.includes("FROM companions") && sql.includes("WHERE id = ?") && !sql.includes("LEFT JOIN")) {
    return (companions.get(values[0] as string) ?? null) as T | null;
  }

  if (sql.includes("FROM relationships") && sql.includes("WHERE user_id = ? AND companion_id = ?")) {
    const [userId, companionId] = values as [string, string];
    const rel = relationships.find((r) => r.user_id === userId && r.companion_id === companionId);
    if (!rel) return null;
    return {
      closeness: rel.closeness ?? 0,
      distance: rel.distance ?? 0,
      first_met_at: rel.first_met_at ?? 0,
      friendship: rel.friendship ?? 0,
      hostility: rel.hostility ?? 0,
      last_interaction_at: rel.last_interaction_at ?? 0,
      level_label: rel.level_label ?? null,
      romance: rel.romance ?? 0,
      tension: rel.tension ?? 0,
      trust: rel.trust ?? 0,
    } as unknown as T;
  }

  if (sql.includes("SELECT COUNT(*) AS n FROM companions")) {
    const ownerId = values[0] as string;
    const n = [...companions.values()].filter(
      (c) => c.created_by === ownerId && c.source === "user" && c.is_active === 1,
    ).length;
    return { n } as unknown as T;
  }

  return null;
}

function mutate(
  sql: string,
  values: unknown[],
  companions: Map<string, CompanionRow>,
  users: Map<string, { id: string; email: string }>,
): void {
  if (sql.includes("INSERT OR IGNORE INTO users")) {
    const [id, email] = values as [string, string];
    if (id && email && !users.has(email)) {
      users.set(email, { email, id });
    }
    return;
  }

  if (sql.includes("INSERT INTO companions")) {
    const [
      id,
      ownerId,
      name,
      appearance,
      personality,
      background,
      speech_style,
      relationship_role,
      preferred_scenes,
      art_url,
      createdAt,
      updatedAt,
    ] = values as [
      string,
      string,
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      number,
      number,
    ];
    companions.set(id, {
      appearance,
      art_url,
      background,
      created_at: createdAt,
      created_by: ownerId,
      id,
      initial_dims: null,
      is_active: 1,
      name,
      personality,
      preferred_scenes,
      relationship_role,
      source: "user",
      speech_style,
      updated_at: updatedAt,
    });
    return;
  }

  if (sql.startsWith("UPDATE companions") && sql.includes("SET name = ?")) {
    // Full update from updateCompanion handler
    const [
      name,
      appearance,
      personality,
      background,
      speech_style,
      relationship_role,
      preferred_scenes,
      art_url,
      updatedAt,
      id,
    ] = values as [
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      number,
      string,
    ];
    const existing = companions.get(id);
    if (existing) {
      companions.set(id, {
        ...existing,
        appearance,
        art_url,
        background,
        name,
        personality,
        preferred_scenes,
        relationship_role,
        speech_style,
        updated_at: updatedAt,
      });
    }
    return;
  }

  if (sql.startsWith("UPDATE companions") && sql.includes("SET is_active = 0")) {
    const [updatedAt, id] = values as [number, string];
    const existing = companions.get(id);
    if (existing) {
      companions.set(id, { ...existing, is_active: 0, updated_at: updatedAt });
    }
  }
}
