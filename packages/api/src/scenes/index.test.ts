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
  created_by?: string | null;
  is_active?: number;
  art_cutout_key?: string | null;
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

type SceneStoryFixture = {
  id: string;
  scene_id: string;
  owner_user_id: string | null;
  title: string;
  synopsis?: string | null;
  source_type?: string;
  is_active?: number;
  created_at?: number;
  updated_at?: number;
};

type SceneStoryTaskFixture = {
  id: string;
  story_id: string;
  task_order: number;
  title: string;
  objective: string;
  ai_guidance: string;
  completion_hint?: string | null;
  is_active?: number;
};

type Fixtures = {
  scenes: SceneFixture[];
  companions: CompanionFixture[];
  profileImages?: Array<{ art_key: string; companion_id: string; user_id: string }>;
  relationships: RelationshipFixture[];
  storyBeats?: StoryBeatFixture[];
  sceneStories?: SceneStoryFixture[];
  sceneStoryTasks?: SceneStoryTaskFixture[];
  sceneStoryProgress?: Array<{ companion_id: string; completed_task_ids: string; current_task_id?: string | null; story_id: string; user_id: string }>;
  userSceneUnlocks?: Array<{ user_id: string; scene_id: string; source_companion_id?: string | null }>;
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
        { art_url: "portraits/maya.webp", id: "maya", name: "Maya" },
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
          id: "pier_cafe",
          mood: "Calm",
          name: "Pier Cafe",
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

    const cafe = body.scenes.find((s) => s.id === "pier_cafe");
    expect(cafe?.unlocked).toBe(true);
    expect(cafe?.unlock_hint).toBeNull();
    expect(cafe?.tags).toEqual(["cafe"]);
    expect(cafe?.potential_companions).toEqual([
      { art_cutout_url: null, art_url: "portraits/maya.webp", id: "maya", level: "Friend", name: "Maya" },
    ]);

    const rooftop = body.scenes.find((s) => s.id === "rooftop");
    expect(rooftop?.unlocked).toBe(false);
    expect(rooftop?.unlock_hint).toMatch(/romance/);
    expect(rooftop?.potential_companions).toEqual([]);
  });

  it("filters no-avatar scene companions and uses profile image overrides", async () => {
    const env = createEnv({
      companions: [
        { art_cutout_key: "cutouts/maya.webp", art_url: "portraits/maya.webp", id: "maya", name: "Maya" },
        { id: "ghost", name: "Ghost" },
        { art_cutout_key: "cutouts/iris.webp", art_url: "portraits/iris.webp", id: "iris", name: "Iris" },
      ],
      profileImages: [
        { art_key: "uploads/user-1/iris-custom.webp", companion_id: "iris", user_id: "user-1" },
      ],
      relationships: [],
      scenes: [
        {
          art_url: null,
          default_companions: '["maya","ghost","iris"]',
          display_order: 1,
          id: "studio",
          mood: "Focused",
          name: "Studio",
          tags: '["studio"]',
          unlock_condition: null,
        },
      ],
    });

    const token = await issueDevToken(env, "player@example.com", "user-1");
    const response = await handleScenesRequest(authedRequest("http://localhost/scenes", token), env, "/scenes");

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      scenes: Array<{
        potential_companions: Array<{ art_cutout_url: string | null; art_url: string | null; id: string }>;
      }>;
    };
    expect(body.scenes[0]?.potential_companions).toEqual([
      { art_cutout_url: "cutouts/maya.webp", art_url: "portraits/maya.webp", id: "maya", level: null, name: "Maya" },
      { art_cutout_url: null, art_url: "uploads/user-1/iris-custom.webp", id: "iris", level: null, name: "Iris" },
    ]);
  });

  it("evaluates scene locks against the requested companion when companion_id is provided", async () => {
    const env = createEnv({
      companions: [
        { created_by: "user-1", id: "echo", name: "Echo", source: "user" },
      ],
      relationships: [
        { closeness: 12, companion_id: "echo", user_id: "user-1" },
      ],
      scenes: [
        {
          art_url: null,
          default_companions: null,
          display_order: 1,
          id: "restaurant",
          mood: "Dinner",
          name: "Restaurant",
          tags: null,
          unlock_condition: JSON.stringify({
            companion_id: "maya",
            dim: "closeness",
            type: "min_relationship",
            value: 10,
          }),
        },
      ],
    });

    const token = await issueDevToken(env, "player@example.com", "user-1");
    const response = await handleScenesRequest(
      authedRequest("http://localhost/scenes?companion_id=echo", token),
      env,
      "/scenes",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { scenes: Array<{ id: string; unlocked: boolean; unlock_hint: string | null }> };
    expect(body.scenes).toEqual([
      expect.objectContaining({ id: "restaurant", unlock_hint: null, unlocked: true }),
    ]);
  });

  it("unlocks a gated scene for the user when any companion relationship meets the gate", async () => {
    const env = createEnv({
      companions: [
        { id: "maya", name: "Maya" },
        { created_by: "user-1", id: "echo", name: "Echo", source: "user" },
      ],
      relationships: [
        { closeness: 12, companion_id: "echo", user_id: "user-1" },
      ],
      scenes: [
        {
          art_url: null,
          default_companions: null,
          display_order: 1,
          id: "restaurant",
          mood: "Dinner",
          name: "Restaurant",
          tags: null,
          unlock_condition: JSON.stringify({
            companion_id: "maya",
            dim: "closeness",
            type: "min_relationship",
            value: 10,
          }),
        },
      ],
    });

    const token = await issueDevToken(env, "player@example.com", "user-1");
    const response = await handleScenesRequest(
      authedRequest("http://localhost/scenes/restaurant/enter?companion_id=maya", token, "POST"),
      env,
      "/scenes/restaurant/enter",
    );

    expect(response?.status).toBe(200);
    expect(fixturesUserSceneUnlocks(env)).toEqual([
      expect.objectContaining({ scene_id: "restaurant", source_companion_id: "echo", user_id: "user-1" }),
    ]);
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

  it("allows entering a gated scene with the requested companion's dimensions", async () => {
    const env = createEnv({
      companions: [
        { created_by: "user-1", id: "echo", name: "Echo", source: "user" },
      ],
      relationships: [
        { closeness: 12, companion_id: "echo", user_id: "user-1" },
      ],
      scenes: [
        {
          art_url: null,
          default_companions: null,
          display_order: 1,
          id: "restaurant",
          mood: "Dinner",
          name: "Restaurant",
          tags: null,
          unlock_condition: JSON.stringify({
            companion_id: "maya",
            dim: "closeness",
            type: "min_relationship",
            value: 10,
          }),
        },
      ],
    });

    const token = await issueDevToken(env, "player@example.com", "user-1");
    const response = await handleScenesRequest(
      authedRequest("http://localhost/scenes/restaurant/enter?companion_id=echo", token, "POST"),
      env,
      "/scenes/restaurant/enter",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { scene: { id: string } };
    expect(body.scene.id).toBe("restaurant");
  });

  it("returns scene + companions + null event on enter happy path", async () => {
    const env = createEnv({
      companions: [{ art_url: "portraits/iris.webp", id: "iris", name: "Iris" }],
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
    expect(body.companions_present[0]).toMatchObject({ art_cutout_url: null });
    expect(body.companions_present[0]?.art_url).toBe("portraits/iris.webp");
    expect(body.companions_present[0]?.name).toBe("Iris");
    expect(body.companions_present[0]?.opener).toContain("Iris");
    expect(body.companions_present[0]?.active_story_beat).toBeNull();
    expect(body.event).toBeNull();
  });

  it("returns an active story beat for a companion in the matching scene", async () => {
    const env = createEnv({
      companions: [{ art_url: "portraits/maya.webp", id: "maya", name: "Maya" }],
      relationships: [{ companion_id: "maya", closeness: 0, user_id: "user-1" }],
      scenes: [
        {
          art_url: null,
          default_companions: '["maya"]',
          display_order: 1,
          id: "pier_cafe",
          mood: "Golden hour",
          name: "Pier Cafe",
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
          scene_id: "pier_cafe",
          stage_gate: "first_contact",
          title: "The Unfinished Sketch",
        },
      ],
    });

    const token = await issueDevToken(env, "player@example.com");
    const response = await handleScenesRequest(
      authedRequest("http://localhost/scenes/pier_cafe/enter", token, "POST"),
      env,
      "/scenes/pier_cafe/enter",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      companions_present: Array<{
        active_story_beat: { id: string; objective: string; status: string; title: string } | null;
        opener: string;
        story_moment: {
          beat_id: string;
          choices: Array<{ id: string; transition_mode: string }>;
          objective: string;
        } | null;
      }>;
    };

    expect(body.companions_present[0]?.opener).toBe("Maya hides the sketchbook half a second too late.");
    expect(body.companions_present[0]?.active_story_beat).toMatchObject({
      id: "maya-b1",
      objective: "Ask about the sketch without pushing.",
      status: "active",
      title: "The Unfinished Sketch",
    });
    expect(body.companions_present[0]?.story_moment).toMatchObject({
      beat_id: "maya-b1",
      objective: "Ask about the sketch without pushing.",
    });
    expect(body.companions_present[0]?.story_moment?.choices.map((choice) => choice.id)).toContain("maya-b1:stay");
  });

  it("lists scene stories with current companion progress and hides other users' private stories", async () => {
    const env = createEnv({
      companions: [{ art_url: "portraits/maya.webp", id: "maya", name: "Maya" }],
      relationships: [],
      scenes: [
        {
          art_url: null,
          default_companions: null,
          display_order: 1,
          id: "bookshop",
          mood: "Rain at the windows",
          name: "Bookshop",
          tags: null,
          unlock_condition: null,
        },
      ],
      sceneStories: [
        {
          id: "official-story",
          owner_user_id: null,
          scene_id: "bookshop",
          source_type: "official_preset",
          synopsis: "A missing page is tucked into the wrong book.",
          title: "The Missing Page",
        },
        {
          id: "my-story",
          owner_user_id: "user-1",
          scene_id: "bookshop",
          source_type: "user_written",
          synopsis: "A private clue trail.",
          title: "After Closing",
        },
        {
          id: "other-story",
          owner_user_id: "user-2",
          scene_id: "bookshop",
          title: "Other User Draft",
        },
      ],
      sceneStoryTasks: [
        {
          ai_guidance: "Guide the user to ask about the torn margin.",
          id: "official-task-1",
          objective: "Ask where the page was found.",
          story_id: "official-story",
          task_order: 1,
          title: "Find the torn margin",
        },
        {
          ai_guidance: "Let the companion notice the checkout desk.",
          id: "official-task-2",
          objective: "Check the desk together.",
          story_id: "official-story",
          task_order: 2,
          title: "Check the desk",
        },
        {
          ai_guidance: "Keep the clue quiet.",
          id: "my-task-1",
          objective: "Choose a private shelf.",
          story_id: "my-story",
          task_order: 1,
          title: "Pick a shelf",
        },
      ],
      sceneStoryProgress: [
        {
          companion_id: "maya",
          completed_task_ids: JSON.stringify(["official-task-1"]),
          current_task_id: "official-task-2",
          story_id: "official-story",
          user_id: "user-1",
        },
      ],
    });

    const token = await issueDevToken(env, "player@example.com", "user-1");
    const response = await handleScenesRequest(
      authedRequest("http://localhost/scenes/bookshop/stories?companion_id=maya", token),
      env,
      "/scenes/bookshop/stories",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      stories: Array<{
        can_edit: boolean;
        current_task: { id: string; status: string; title: string } | null;
        id: string;
        progress_percent: number;
        source_type: string;
        task_count: number;
        title: string;
      }>;
    };

    expect(body.stories.map((story) => story.id)).toEqual(["official-story", "my-story"]);
    expect(body.stories[0]).toMatchObject({
      can_edit: false,
      current_task: { id: "official-task-2", status: "active", title: "Check the desk" },
      progress_percent: 50,
      source_type: "official_preset",
      task_count: 2,
      title: "The Missing Page",
    });
    expect(body.stories[1]).toMatchObject({
      can_edit: true,
      current_task: { id: "my-task-1", status: "active", title: "Pick a shelf" },
      progress_percent: 0,
      source_type: "user_written",
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
    __fixtures: fixtures,
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
      if (sql.includes("INSERT OR IGNORE INTO user_scene_unlocks")) {
        const [user_id, scene_id, , source_companion_id] = values as [string, string, number, string | null];
        fixtures.userSceneUnlocks ??= [];
        if (!fixtures.userSceneUnlocks.some((row) => row.user_id === user_id && row.scene_id === scene_id)) {
          fixtures.userSceneUnlocks.push({ scene_id, source_companion_id, user_id });
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

  if (sql.includes("FROM scene_stories") && sql.includes("WHERE id = ?")) {
    const [storyId, sceneId, userId] = values as [string, string, string];
    const found = (fixtures.sceneStories ?? []).find(
      (story) =>
        story.id === storyId &&
        story.scene_id === sceneId &&
        (story.is_active ?? 1) === 1 &&
        (story.owner_user_id === null || story.owner_user_id === userId),
    );
    return (found ? sceneStoryRow(found) : null) as T | null;
  }

  if (sql.includes("FROM user_scene_unlocks")) {
    const [userId, sceneId] = values as [string, string];
    const found = (fixtures.userSceneUnlocks ?? []).find((row) => row.user_id === userId && row.scene_id === sceneId);
    return (found ? { one: 1 } : null) as T | null;
  }

  if (sql.includes("FROM companions") && sql.includes("WHERE id = ?")) {
    const found = fixtures.companions.find((c) => c.id === values[0]);
    return found
      ? ({
          created_by: found.created_by ?? null,
          is_active: found.is_active ?? 1,
          source: found.source ?? "official",
        } as T)
      : null;
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

  if (sql.includes("FROM user_scene_story_progress")) {
    const [userId, storyId, companionId] = values as [string, string, string];
    const found = (fixtures.sceneStoryProgress ?? []).find(
      (progress) =>
        progress.user_id === userId &&
        progress.story_id === storyId &&
        progress.companion_id === companionId,
    );
    return (found ? {
      completed_task_ids: found.completed_task_ids,
      current_task_id: found.current_task_id ?? null,
    } : null) as T | null;
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
    // values[0] = relationship userId, values[1] = profile image userId, values[2..] = companion ids
    const userId = values[0] as string;
    const profileUserId = values[1] as string;
    const ids = values.slice(2) as string[];
    const results = fixtures.companions
      .filter((c) => ids.includes(c.id) && (c.is_active ?? 1) === 1)
      .map((c) => {
        const override = (fixtures.profileImages ?? []).find(
          (image) => image.user_id === profileUserId && image.companion_id === c.id,
        );
        return { companion: c, effectiveArt: override?.art_key ?? c.art_url ?? null, hasOverride: Boolean(override) };
      })
      .filter((entry) => entry.effectiveArt !== null)
      .map((c) => {
        const rel = fixtures.relationships.find((r) => r.user_id === userId && r.companion_id === c.companion.id);
        return {
          art_url: c.effectiveArt,
          art_cutout_key: c.hasOverride ? null : c.companion.art_cutout_key ?? null,
          gender: c.companion.gender ?? null,
          id: c.companion.id,
          level_label: rel?.level_label ?? null,
          name: c.companion.name,
          source: c.companion.source ?? "official",
        };
      });
    return results as unknown as T[];
  }

  if (sql.includes("FROM relationships") && sql.includes("WHERE user_id = ?")) {
    const userId = values[0] as string;
    return fixtures.relationships
      .filter((r) => r.user_id === userId)
      .map((r) => ({
        closeness: r.closeness ?? 0,
        companion_id: r.companion_id,
        distance: r.distance ?? 0,
        friendship: r.friendship ?? 0,
        hostility: r.hostility ?? 0,
        romance: r.romance ?? 0,
        tension: r.tension ?? 0,
        trust: r.trust ?? 0,
      })) as unknown as T[];
  }

  if (sql.includes("FROM companion_story_beats")) {
    const companionId = values[0] as string;
    return (fixtures.storyBeats ?? [])
      .filter((beat) => beat.companion_id === companionId && (beat.is_active ?? 1) === 1)
      .sort((a, b) => a.beat_order - b.beat_order || a.id.localeCompare(b.id)) as unknown as T[];
  }

  if (sql.includes("FROM scene_stories")) {
    const [sceneId, userId] = values as [string, string];
    return (fixtures.sceneStories ?? [])
      .filter(
        (story) =>
          story.scene_id === sceneId &&
          (story.is_active ?? 1) === 1 &&
          (story.owner_user_id === null || story.owner_user_id === userId),
      )
      .sort((a, b) => {
        const ownerSort = (a.owner_user_id === null ? 0 : 1) - (b.owner_user_id === null ? 0 : 1);
        if (ownerSort !== 0) return ownerSort;
        const updatedSort = (b.updated_at ?? 0) - (a.updated_at ?? 0);
        return updatedSort || a.title.localeCompare(b.title);
      })
      .map(sceneStoryRow) as unknown as T[];
  }

  if (sql.includes("FROM scene_story_tasks")) {
    const storyId = values[0] as string;
    return (fixtures.sceneStoryTasks ?? [])
      .filter((task) => task.story_id === storyId && (task.is_active ?? 1) === 1)
      .sort((a, b) => a.task_order - b.task_order || a.id.localeCompare(b.id))
      .map((task) => ({
        ai_guidance: task.ai_guidance,
        completion_hint: task.completion_hint ?? null,
        created_at: 0,
        id: task.id,
        is_active: task.is_active ?? 1,
        objective: task.objective,
        story_id: task.story_id,
        task_order: task.task_order,
        title: task.title,
        updated_at: 0,
      })) as unknown as T[];
  }

  return [];
}

function fixturesUserSceneUnlocks(env: Env) {
  return (env as unknown as { __fixtures?: Fixtures }).__fixtures?.userSceneUnlocks ?? [];
}

function sceneStoryRow(story: SceneStoryFixture) {
  return {
    created_at: story.created_at ?? 0,
    id: story.id,
    is_active: story.is_active ?? 1,
    owner_user_id: story.owner_user_id,
    scene_id: story.scene_id,
    source_type: story.source_type ?? "user_written",
    synopsis: story.synopsis ?? null,
    title: story.title,
    updated_at: story.updated_at ?? 0,
  };
}
