import { beforeEach, describe, expect, it, vi } from "vitest";

import { QUICK_GIFT_COOLDOWN_MS } from "./config";
import { ZERO_DIMENSIONS } from "../relationships/level";

const quickMocks = vi.hoisted(() => ({
  applySignals: vi.fn(),
  detectAndRecordUnlocks: vi.fn(),
  detectNewSceneUnlocks: vi.fn(),
  loadRelationship: vi.fn(),
  onActivityCompleted: vi.fn(),
}));

vi.mock("../relationships/engine", () => ({
  applySignals: quickMocks.applySignals,
  loadRelationship: quickMocks.loadRelationship,
}));

vi.mock("../relationships/unlocks", () => ({
  detectAndRecordUnlocks: quickMocks.detectAndRecordUnlocks,
}));

vi.mock("../scenes/unlock-events", () => ({
  detectNewSceneUnlocks: quickMocks.detectNewSceneUnlocks,
}));

vi.mock("./memory-hooks", () => ({
  onActivityCompleted: quickMocks.onActivityCompleted,
}));

import { commitQuickAction, parseQuickAction, validateQuickAction } from "./quick-actions";

type CooldownRow = { user_id: string; companion_id: string; item_id: string; started_at: number };

function createEnv(rows: CooldownRow[] = [], inserts: unknown[][] = []): Env {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(...binds: unknown[]) {
            return {
              async first<T>() {
                const [userId, companionId, itemId] = binds as [string, string, string];
                const row = rows
                  .filter((r) => r.user_id === userId && r.companion_id === companionId && r.item_id === itemId)
                  .sort((a, b) => b.started_at - a.started_at)[0];
                return (row ? { started_at: row.started_at } : null) as T | null;
              },
              async run() {
                if (sql.includes("INSERT INTO activity_contexts")) {
                  inserts.push(binds);
                }
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  } as unknown as Env;
}

const cafeScene = {
  id: "cafe",
  mood: "Warm coffee aroma",
  name: "Corner Cafe",
  tags: ["cozy"],
};

const gardenScene = {
  id: "garden",
  mood: "Quiet",
  name: "Moon Garden",
  tags: ["flowers"],
};

beforeEach(() => {
  quickMocks.applySignals.mockReset();
  quickMocks.detectAndRecordUnlocks.mockReset();
  quickMocks.detectNewSceneUnlocks.mockReset();
  quickMocks.loadRelationship.mockReset();
  quickMocks.onActivityCompleted.mockReset();
});

describe("parseQuickAction", () => {
  it("accepts supported gift items only", () => {
    expect(parseQuickAction({ item_id: "coffee", type: "gift" })).toEqual({ item_id: "coffee", type: "gift" });
    expect(parseQuickAction({ item_id: "flowers", type: "gift" })).toEqual({ item_id: "flowers", type: "gift" });
    expect(parseQuickAction({ item_id: "tea", type: "gift" })).toBeNull();
    expect(parseQuickAction({ item_id: "coffee", type: "scene" })).toBeNull();
  });
});

describe("validateQuickAction", () => {
  it("rejects coffee outside a cafe or coffee scene", async () => {
    const result = await validateQuickAction(createEnv(), {
      companionId: "maya",
      now: 10_000,
      raw: { item_id: "coffee", type: "gift" },
      scene: gardenScene,
      userId: "u1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(422);
      await expect(result.response.json()).resolves.toMatchObject({ reason: "coffee_requires_cafe" });
    }
  });

  it("allows coffee in a cafe or coffee scene", async () => {
    const result = await validateQuickAction(createEnv(), {
      companionId: "maya",
      now: 10_000,
      raw: { item_id: "coffee", type: "gift" },
      scene: cafeScene,
      userId: "u1",
    });

    expect(result).toMatchObject({ action: { item_id: "coffee", scene_id: "cafe" }, ok: true });
  });

  it("allows flowers in any current scene", async () => {
    const result = await validateQuickAction(createEnv(), {
      companionId: "maya",
      now: 10_000,
      raw: { item_id: "flowers", type: "gift" },
      scene: gardenScene,
      userId: "u1",
    });

    expect(result).toMatchObject({ action: { item_id: "flowers", scene_id: "garden" }, ok: true });
  });

  it("enforces a six-hour cooldown by companion and item", async () => {
    const now = 1_000_000;
    const env = createEnv([
      { companion_id: "maya", item_id: "flowers", started_at: now - 1_000, user_id: "u1" },
    ]);
    const result = await validateQuickAction(env, {
      companionId: "maya",
      now,
      raw: { item_id: "flowers", type: "gift" },
      scene: gardenScene,
      userId: "u1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(422);
      await expect(result.response.json()).resolves.toMatchObject({
        cooldown_until: now - 1_000 + QUICK_GIFT_COOLDOWN_MS,
        error: "quick_action_on_cooldown",
        item_id: "flowers",
      });
    }
  });
});

describe("commitQuickAction", () => {
  it("creates a completed gift activity, records memory, applies fixed relationship delta, and returns unlocks", async () => {
    const inserts: unknown[][] = [];
    const env = createEnv([], inserts);
    const now = 2_000_000;
    quickMocks.loadRelationship.mockResolvedValue({
      dimensions: { ...ZERO_DIMENSIONS },
      first_met_at: 1,
      last_interaction_at: 1,
      level: "Stranger",
    });
    quickMocks.applySignals.mockResolvedValue({
      dimensions: { ...ZERO_DIMENSIONS, closeness: 1, trust: 1 },
      first_met_at: 1,
      last_interaction_at: now,
      level: "Familiar",
    });
    quickMocks.detectAndRecordUnlocks.mockResolvedValue({
      newlyUnlocked: [{ key: "title:familiar", kind: "title", label: "They use your name now" }],
      stage: "familiar",
    });
    quickMocks.detectNewSceneUnlocks.mockResolvedValue([
      { key: "scene:rooftop", kind: "scene", label: "New place unlocked: Rooftop", scene_id: "rooftop", scene_name: "Rooftop" },
    ]);

    const result = await commitQuickAction(env, {
      action: {
        description: "The user ordered coffee for both of you.",
        item_id: "coffee",
        label: "Order coffee",
        scene_id: "cafe",
        scene_mood: "Warm",
        scene_name: "Corner Cafe",
        scene_tags: ["coffee"],
      },
      companionId: "maya",
      now,
      userId: "u1",
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.[1]).toBe("u1");
    expect(inserts[0]?.[2]).toBe("maya");
    expect(inserts[0]?.[3]).toBe("cafe");
    expect(JSON.parse(String(inserts[0]?.[5]))).toMatchObject({ item_id: "coffee", quick_action: true });
    expect(quickMocks.onActivityCompleted).toHaveBeenCalledWith(env, expect.objectContaining({
      activity_type: "gift",
      companion_id: "maya",
      metadata: { item_id: "coffee", quick_action: true },
      user_id: "u1",
    }));
    expect(quickMocks.applySignals).toHaveBeenCalledWith(env, "u1", "maya", { closeness: 1, trust: 1 }, now);
    expect(result).toMatchObject({ item_id: "coffee" });
    expect(result.unlocks.map((unlock) => unlock.key)).toEqual(["title:familiar", "scene:rooftop"]);
  });
});
