import { describe, expect, it } from "vitest";

import { requireAuthUser } from "../auth";
import { createSessionsStore, issueTestSessionToken, type SessionsStore } from "../auth/test-fixtures";
import { handleScenesRequest } from "./index";

type SceneFixture = {
  id: string;
  name: string;
  mood: string;
  tags: string | null;
  default_companions: string | null;
  unlock_condition: string | null;
  art_url: string | null;
  display_order: number;
  is_active?: number;
};

type CompanionFixture = {
  id: string;
  name: string;
  is_active?: number;
  gender?: "male" | "female" | null;
  source?: "official" | "user";
  art_url?: string | null;
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
};

type StoryBeatFixture = {
  id: string;
  companion_id: string;
  beat_order: number;
  title: string;
  stage_gate: string;
  scene_id: string | null;
  opener: string;
  objective: string;
  reward_unlock_key: string | null;
  is_active?: number;
};

type Fixtures = {
  scenes: SceneFixture[];
  companions: CompanionFixture[];
  relationships: RelationshipFixture[];
  storyBeats?: StoryBeatFixture[];
};

describe("scenes module", () => {
  it("rejects unauthenticated GET /scenes with 401", async () => {
    const env = createEnv({ companions: [], relationships: [], scenes: [] });
    await expect(
      handleScenesRequest(new Request("http://localhost/scenes"), env, "/scenes"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("returns empty list when authenticated user has no scenes", async () => {
    const env = createEnv({ companions: [], relationships: [], scenes: [] });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleScenesRequest(authedRequest("http://localhost/scenes", token), env, "/scenes");

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { scenes: unknown[] };
    expect(body.scenes).toEqual([]);
  });

  it("returns unlocked + locked scenes with hints and companions", async () => {
    const env = createEnv({
      companions: [
        { id: "maya", name: "Maya" },
        { id: "ryan", name: "Ryan", is_active: 0 }, // inactive should be filtered out
      ],
      relationships: [
        { companion_id: "maya", level_label: "Friend", user_id: "user-1" },
      ],
      scenes: [
        {
          art_url: null,
          default_companions: '["maya","ryan"]',
          display_order: 1,
          id: "cafe",
          mood: "Calm",
          name: "Cafe",
          tags: '["cafe"]',
          unlock_condition: null,
        },
        {
          art_url: null,
          default_companions: null,
          display_order: 2,
          id: "rooftop",
          mood: "Quiet",
          name: "Rooftop",
          tags: null,
          unlock_condition: JSON.stringify({
            companion_id: "maya",
            dim: "romance",
            type: "min_relationship",
            value: 50,
          }),
        },
      ],
    });

    const token = await issueDevToken(env, "player@example.com", "user-1");
    const response = await handleScenesRequest(authedRequest("http://localhost/scenes", token), env, "/scenes");

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      scenes: Array<{
        id: string;
        unlocked: boolean;
        unlock_hint: string | null;
        potential_companions: Array<{ id: string; name: string; level: string | null }>;
        tags: string[];
      }>;
    };

    expect(body.scenes).toHaveLength(2);

    const cafe = body.scenes.find((s) => s.id === "cafe");
    expect(cafe?.unlocked).toBe(true);
    expect(cafe?.unlock_hint).toBeNull();
    expect(cafe?.tags).toEqual(["cafe"]);
    expect(cafe?.potential_companions).toEqual([
      { art_url: null, id: "maya", level: "Friend", name: "Maya" },
    ]);

    const rooftop = body.scenes.find((s) => s.id === "rooftop");
    expect(rooftop?.unlocked).toBe(false);
    expect(rooftop?.unlock_hint).toMatch(/romance/);
    expect(rooftop?.potential_companions).toEqual([]);
  });

  it("returns 404 for missing scene on POST /scenes/{id}/enter", async () => {
    const env = createEnv({ companions: [], relationships: [], scenes: [] });
    const token = await issueDevToken(env, "player@example.com");
    const response = await handleScenesRequest(
      authedRequest("http://localhost/scenes/missing/enter", token, "POST"),
      env,
      "/scenes/missing/enter",
    );

    expect(response?.status).toBe(404);
  });

  it("returns 403 with hint when scene is locked", async () => {
    const env = createEnv({
      companions: [],
      relationships: [],
      scenes: [
        {
          art_url: null,
          default_companions: null,
          display_order: 1,
          id: "secret",
          mood: "Hidden",
          name: "Secret",
          tags: null,
          unlock_condition: JSON.stringify({
            companion_id: "maya",
            dim: "trust",
            type: "min_relationship",
            value: 40,
          }),
        },
      ],
    });

    const token = await issueDevToken(env, "player@example.com");
    const response = await handleScenesRequest(
      authedRequest("http://localhost/scenes/secret/enter", token, "POST"),
      env,
      "/scenes/secret/enter",
    );

    expect(response?.status).toBe(403);
    const body = (await response?.json()) as { error: string; unlock_hint: string };
    expect(body.error).toBe("scene_locked");
    expect(body.unlock_hint).toMatch(/trust/);
  });

  it("returns scene + companions + null event on enter happy path", async () => {
    const env = createEnv({
      companions: [{ id: "iris", name: "Iris" }],
      relationships: [],
      scenes: [
        {
          art_url: "https://cdn/scene.png",
          default_companions: '["iris"]',
          display_order: 1,
          id: "home",
          mood: "Quiet morning",
          name: "Home",
          tags: '["home"]',
          unlock_condition: null,
        },
      ],
    });

    const token = await issueDevToken(env, "player@example.com");
    const response = await handleScenesRequest(
      authedRequest("http://localhost/scenes/home/enter", token, "POST"),
      env,
      "/scenes/home/enter",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      scene: { id: string; tags: string[]; art_url: string | null };
      companions_present: Array<{
        active_story_beat: {
          id: string;
          objective: string;
          status: string;
          title: string;
        } | null;
        id: string;
        name: string;
        opener: string;
        art_url: string | null;
      }>;
      event: null;
    };

    expect(body.scene.id).toBe("home");
    expect(body.scene.tags).toEqual(["home"]);
    expect(body.scene.art_url).toBe("https://cdn/scene.png");
    expect(body.companions_present).toHaveLength(1);
    expect(body.companions_present[0]?.id).toBe("iris");
    expect(body.companions_present[0]?.name).toBe("Iris");
    expect(body.companions_present[0]?.opener).toContain("Iris");
    expect(body.companions_present[0]?.active_story_beat).toBeNull();
    expect(body.event).toBeNull();
  });

  it("returns an active story beat for a companion in the matching scene", async () => {
    const env = createEnv({
      companions: [{ id: "maya", name: "Maya" }],
      relationships: [{ companion_id: "maya", closeness: 0, user_id: "user-1" }],
      scenes: [
        {
          art_url: null,
          default_companions: '["maya"]',
          display_order: 1,
          id: "cafe",
          mood: "Golden hour",
          name: "Cafe",
          tags: '["cafe"]',
          unlock_condition: null,
        },
      ],
      storyBeats: [
        {
          beat_order: 1,
          companion_id: "maya",
          id: "maya-b1",
          objective: "Ask about the sketch without pushing.",
          opener: "Maya hides the sketchbook half a second too late.",
          reward_unlock_key: null,
          scene_id: "cafe",
          stage_gate: "first_contact",
          title: "The Unfinished Sketch",
        },
      ],
    });

    const token = await issueDevToken(env, "player@example.com");
    const response = await handleScenesRequest(
      authedRequest("http://localhost/scenes/cafe/enter", token, "POST"),
      env,
      "/scenes/cafe/enter",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      companions_present: Array<{
        active_story_beat: { id: string; objective: string; status: string; title: string } | null;
        opener: string;
      }>;
    };

    expect(body.companions_present[0]?.opener).toBe("Maya hides the sketchbook half a second too late.");
    expect(body.companions_present[0]?.active_story_beat).toMatchObject({
      id: "maya-b1",
      objective: "Ask about the sketch without pushing.",
      status: "active",
      title: "The Unfinished Sketch",
    });
  });
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function issueDevToken(env: Env, email: string, _userId?: string): Promise<string> {
  return issueTestSessionToken(env, email);
}

function authedRequest(url: string, token: string, method: "GET" | "POST" = "GET"): Request {
  return new Request(url, {
    headers: { authorization: `Bearer ${token}` },
    method,
  });
}

function createEnv(fixtures: Fixtures): Env {
  // Pre-create users so dev-session can issue tokens deterministically.
  const users = new Map<string, { id: string; email: string }>();
  users.set("player@example.com", { email: "player@example.com", id: "user-1" });
  const sessionsStore = createSessionsStore();

  return {
    APP_ENV: "dev",
    AUTH_TOKEN_SECRET: "test-auth-secret",
    DB: {
      prepare(sql: string) {
        return buildStatement(sql, fixtures, users, sessionsStore);
      },
    },
  } as unknown as Env;
}

function buildStatement(
  sql: string,
  fixtures: Fixtures,
  users: Map<string, { id: string; email: string }>,
  sessionsStore: SessionsStore,
) {
  const statementFor = (values: unknown[]) => ({
    async all<T>(): Promise<{ results: T[] }> {
      return { results: queryAll<T>(sql, values, fixtures) };
    },
    async first<T>(): Promise<T | null> {
      const sessionResult = sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "first") {
        return sessionResult.result as unknown as T | null;
      }
      return queryFirst<T>(sql, values, fixtures, users);
    },
    async run() {
      const sessionResult = sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "run") {
        return sessionResult.result;
      }
      if (sql.includes("INSERT OR IGNORE INTO users")) {
        const [id, email] = values as [string, string];
        if (id && email && !users.has(email)) {
          users.set(email, { email, id });
        }
      }
      return { meta: { changes: 1 } };
    },
  });

  const unbound = statementFor([]);
  return {
    ...unbound,
    bind(...values: unknown[]) {
      return statementFor(values);
    },
  };
}

function queryFirst<T>(
  sql: string,
  values: unknown[],
  fixtures: Fixtures,
  users: Map<string, { id: string; email: string }>,
): T | null {
  if (sql.includes("FROM admin_user_allowlist")) {
    return { email: values[0] as string } as T;
  }

  if (sql.includes("FROM users")) {
    if (sql.includes("romance_preference") && sql.includes("WHERE id = ?")) {
      // Scenes module reads the user's preference; tests default to 'any'.
      return { pref: null } as unknown as T;
    }
    if (sql.includes("WHERE email = ?")) {
      return (users.get(values[0] as string) ?? null) as T | null;
    }
    if (sql.includes("WHERE id = ?")) {
      return ([...users.values()].find((u) => u.id === values[0]) ?? null) as T | null;
    }
  }

  if (sql.includes("FROM scenes") && sql.includes("WHERE id = ?")) {
    const found = fixtures.scenes.find((s) => s.id === values[0] && (s.is_active ?? 1) === 1);
    return (found ?? null) as T | null;
  }

  if (sql.includes("FROM relationships") && sql.includes("WHERE user_id = ? AND companion_id = ?")) {
    const [userId, companionId] = values as [string, string];
    const found = fixtures.relationships.find(
      (r) => r.user_id === userId && r.companion_id === companionId,
    );
    return found
      ? ({
          closeness: found.closeness ?? 0,
          distance: found.distance ?? 0,
          first_met_at: 0,
          friendship: found.friendship ?? 0,
          hostility: found.hostility ?? 0,
          last_interaction_at: 0,
          level_label: found.level_label ?? "Stranger",
          romance: found.romance ?? 0,
          tension: found.tension ?? 0,
          trust: found.trust ?? 0,
        } as T)
      : null;
  }

  if (sql.includes("FROM user_story_progress")) {
    return { completed_beat_ids: "[]" } as T;
  }

  return null;
}

function queryAll<T>(sql: string, values: unknown[], fixtures: Fixtures): T[] {
  if (sql.includes("FROM scenes") && sql.includes("WHERE is_active = 1")) {
    return fixtures.scenes
      .filter((s) => (s.is_active ?? 1) === 1)
      .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)) as unknown as T[];
  }

  if (sql.includes("FROM companions c") && sql.includes("LEFT JOIN relationships r")) {
    // values[0] = userId, values[1..] = companion ids
    const userId = values[0] as string;
    const ids = values.slice(1) as string[];
    const results = fixtures.companions
      .filter((c) => ids.includes(c.id) && (c.is_active ?? 1) === 1)
      .map((c) => {
        const rel = fixtures.relationships.find((r) => r.user_id === userId && r.companion_id === c.id);
        return {
          art_url: c.art_url ?? null,
          gender: c.gender ?? null,
          id: c.id,
          level_label: rel?.level_label ?? null,
          name: c.name,
          source: c.source ?? "official",
        };
      });
    return results as unknown as T[];
  }

  if (sql.includes("FROM companion_story_beats")) {
    const companionId = values[0] as string;
    return (fixtures.storyBeats ?? [])
      .filter((beat) => beat.companion_id === companionId && (beat.is_active ?? 1) === 1)
      .sort((a, b) => a.beat_order - b.beat_order || a.id.localeCompare(b.id)) as unknown as T[];
  }

  return [];
}
