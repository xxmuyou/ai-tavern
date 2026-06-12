import { describe, expect, it } from "vitest";

import { loadInviteTargets, resolveInviteTarget } from "./invite";

type SceneRow = {
  id: string;
  name: string;
  mood: string;
  art_url: string | null;
  default_companions: string | null;
  unlock_condition: string | null;
  display_order: number;
  is_active?: number;
};

type RelRow = { user_id: string; companion_id: string; closeness?: number; romance?: number; trust?: number };

type Fixtures = {
  scenes: SceneRow[];
  relationships: RelRow[];
  userSceneUnlocks?: Array<{ user_id: string; scene_id: string; source_companion_id?: string | null }>;
};

function createEnv(fixtures: Fixtures): Env {
  const statementFor = (sql: string, values: unknown[]) => ({
    async all<T>(): Promise<{ results: T[] }> {
      if (sql.includes("FROM relationships") && sql.includes("WHERE user_id = ?")) {
        const userId = values[0] as string;
        return {
          results: fixtures.relationships
            .filter((r) => r.user_id === userId)
            .map((r) => ({
              closeness: r.closeness ?? 0,
              companion_id: r.companion_id,
              distance: 0,
              friendship: 0,
              hostility: 0,
              romance: r.romance ?? 0,
              tension: 0,
              trust: r.trust ?? 0,
            })) as unknown as T[],
        };
      }
      return {
        results: fixtures.scenes
          .filter((s) => (s.is_active ?? 1) === 1)
          .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)) as unknown as T[],
      };
    },
    async first<T>(): Promise<T | null> {
      if (sql.includes("FROM user_scene_unlocks")) {
        const [userId, sceneId] = values as [string, string];
        const found = (fixtures.userSceneUnlocks ?? []).find((row) => row.user_id === userId && row.scene_id === sceneId);
        return (found ? { one: 1 } : null) as T | null;
      }
      return null;
    },
    async run() {
      if (sql.includes("INSERT OR IGNORE INTO user_scene_unlocks")) {
        const [user_id, scene_id, , source_companion_id] = values as [string, string, number, string | null];
        fixtures.userSceneUnlocks ??= [];
        if (!fixtures.userSceneUnlocks.some((row) => row.user_id === user_id && row.scene_id === scene_id)) {
          fixtures.userSceneUnlocks.push({ scene_id, source_companion_id, user_id });
          return { meta: { changes: 1 } };
        }
      }
      return { meta: { changes: 0 } };
    },
  });
  return {
    DB: {
      prepare(sql: string) {
        const unbound = statementFor(sql, []);
        return { ...unbound, bind: (...v: unknown[]) => statementFor(sql, v) };
      },
    },
  } as unknown as Env;
}

const cafe: SceneRow = {
  art_url: "cafe.png",
  default_companions: '["maya","ryan"]',
  display_order: 1,
  id: "pier_cafe",
  mood: "Calm",
  name: "Pier Cafe",
  unlock_condition: null,
};
const tavern: SceneRow = {
  art_url: "tavern.png",
  default_companions: '["maya"]',
  display_order: 2,
  id: "tavern",
  mood: "Warm, noisy",
  name: "Tavern",
  unlock_condition: null,
};
const restaurant: SceneRow = {
  art_url: "scenes/restaurant.png",
  default_companions: '["maya","theo","ryan","iris"]',
  display_order: 3,
  id: "restaurant",
  mood: "Warm dinner conversation",
  name: "Restaurant",
  unlock_condition: JSON.stringify({ companion_id: "maya", dim: "closeness", type: "min_relationship", value: 10 }),
};
const hotel: SceneRow = {
  art_url: "hotel.png",
  default_companions: '["maya"]',
  display_order: 4,
  id: "hotel",
  mood: "Intimate",
  name: "Hotel",
  // locked until romance >= 50 with maya
  unlock_condition: JSON.stringify({ companion_id: "maya", dim: "romance", type: "min_relationship", value: 50 }),
};
const rooftop: SceneRow = {
  art_url: "rooftop.png",
  default_companions: '["ryan"]', // maya not present here
  display_order: 5,
  id: "rooftop",
  mood: "Quiet",
  name: "Rooftop",
  unlock_condition: null,
};

describe("loadInviteTargets", () => {
  it("lists all unlocked scenes, excluding the current scene", async () => {
    const env = createEnv({ relationships: [], scenes: [cafe, tavern, hotel, rooftop] });
    const targets = await loadInviteTargets(env, "user-1", "maya", "pier_cafe");
    // cafe excluded (current), hotel excluded (locked, romance 0 < 50).
    // rooftop is allowed even though maya is not in default_companions.
    expect(targets.map((t) => t.id)).toEqual(["tavern", "rooftop"]);
    expect(targets[0]).toMatchObject({ art_url: "tavern.png", mood: "Warm, noisy", name: "Tavern" });
  });

  it("reveals an intimate scene only once its relationship gate is met", async () => {
    const locked = createEnv({ relationships: [{ companion_id: "maya", romance: 10, user_id: "user-1" }], scenes: [tavern, hotel] });
    expect((await loadInviteTargets(locked, "user-1", "maya", null)).map((t) => t.id)).toEqual(["tavern"]);

    const unlocked = createEnv({ relationships: [{ companion_id: "maya", romance: 60, user_id: "user-1" }], scenes: [tavern, hotel] });
    expect((await loadInviteTargets(unlocked, "user-1", "maya", null)).map((t) => t.id)).toEqual(["tavern", "hotel"]);
  });

  it("reveals Restaurant through a low closeness gate, not a romance gate", async () => {
    const locked = createEnv({ relationships: [{ companion_id: "maya", closeness: 9, romance: 0, user_id: "user-1" }], scenes: [restaurant] });
    expect(await loadInviteTargets(locked, "user-1", "maya", null)).toEqual([]);

    const unlocked = createEnv({ relationships: [{ companion_id: "maya", closeness: 10, romance: 0, user_id: "user-1" }], scenes: [restaurant] });
    expect(await loadInviteTargets(unlocked, "user-1", "maya", null)).toMatchObject([
      { art_url: "scenes/restaurant.png", id: "restaurant", name: "Restaurant" },
    ]);
  });

  it("evaluates gates against the current companion, including user-created companions", async () => {
    const locked = createEnv({ relationships: [{ companion_id: "echo", closeness: 9, user_id: "user-1" }], scenes: [restaurant] });
    expect(await loadInviteTargets(locked, "user-1", "echo", null)).toEqual([]);

    const unlocked = createEnv({ relationships: [{ companion_id: "echo", closeness: 12, user_id: "user-1" }], scenes: [restaurant] });
    expect(await loadInviteTargets(unlocked, "user-1", "echo", null)).toMatchObject([
      { id: "restaurant", name: "Restaurant" },
    ]);
  });

  it("allows inviting any companion to a scene unlocked through another companion", async () => {
    const env = createEnv({ relationships: [{ companion_id: "echo", closeness: 12, user_id: "user-1" }], scenes: [restaurant] });
    expect(await loadInviteTargets(env, "user-1", "maya", null)).toMatchObject([
      { id: "restaurant", name: "Restaurant" },
    ]);
  });
});

describe("resolveInviteTarget", () => {
  it("returns the target when valid (active + unlocked)", async () => {
    const env = createEnv({ relationships: [], scenes: [cafe, tavern] });
    const target = await resolveInviteTarget(env, "user-1", "maya", "tavern");
    expect(target).toMatchObject({ id: "tavern", name: "Tavern" });
  });

  it("allows a scene even when the companion is not in default_companions", async () => {
    const env = createEnv({ relationships: [], scenes: [rooftop] });
    expect(await resolveInviteTarget(env, "user-1", "maya", "rooftop")).toMatchObject({ id: "rooftop" });
  });

  it("returns null for a locked scene (cannot invite past the relationship gate)", async () => {
    const env = createEnv({ relationships: [{ companion_id: "maya", romance: 0, user_id: "user-1" }], scenes: [hotel] });
    expect(await resolveInviteTarget(env, "user-1", "maya", "hotel")).toBeNull();
  });

  it("returns null for an unknown scene id", async () => {
    const env = createEnv({ relationships: [], scenes: [cafe] });
    expect(await resolveInviteTarget(env, "user-1", "maya", "nope")).toBeNull();
  });
});
