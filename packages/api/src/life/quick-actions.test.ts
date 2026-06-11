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
  id: "pier_cafe",
  mood: "Warm coffee aroma",
  name: "Pier Cafe",
  tags: ["cafe", "cozy"],
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

  it("accepts scene action ids", () => {
    expect(parseQuickAction({ action_id: "restaurant_skip_bill", type: "scene_action" })).toEqual({
      action_id: "restaurant_skip_bill",
      type: "scene_action",
    });
    expect(parseQuickAction({ action_id: "", type: "scene_action" })).toBeNull();
  });

  it("accepts trimmed custom scene actions", () => {
    expect(parseQuickAction({ text: "  spin around  ", type: "custom_scene_action" })).toEqual({
      text: "spin around",
      type: "custom_scene_action",
    });
    expect(parseQuickAction({ text: "   ", type: "custom_scene_action" })).toBeNull();
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

    expect(result).toMatchObject({ action: { item_id: "coffee", scene_id: "pier_cafe" }, ok: true });
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

  it("allows scene actions that belong to the current scene", async () => {
    const result = await validateQuickAction(createEnv(), {
      companionId: "maya",
      now: 10_000,
      raw: { action_id: "restaurant_skip_bill", type: "scene_action" },
      scene: { id: "restaurant", mood: "Warm dinner", name: "Restaurant", tags: ["restaurant"] },
      userId: "u1",
    });

    expect(result).toMatchObject({
      action: {
        action_id: "restaurant_skip_bill",
        item_id: "restaurant_skip_bill",
        kind: "scene_action",
        label: "Skip the bill",
        scene_id: "restaurant",
        tone: "negative",
      },
      ok: true,
    });
  });

  it("rejects scene actions that do not belong to the current scene", async () => {
    const result = await validateQuickAction(createEnv(), {
      companionId: "maya",
      now: 10_000,
      raw: { action_id: "restaurant_skip_bill", type: "scene_action" },
      scene: cafeScene,
      userId: "u1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(422);
      await expect(result.response.json()).resolves.toMatchObject({
        error: "quick_action_unavailable",
        reason: "scene_action_unavailable",
      });
    }
  });

  it("allows custom scene actions in the current scene", async () => {
    const result = await validateQuickAction(createEnv(), {
      companionId: "maya",
      now: 10_000,
      raw: { text: "write a note on the receipt", type: "custom_scene_action" },
      scene: { id: "restaurant", mood: "Warm dinner", name: "Restaurant", tags: ["restaurant"] },
      userId: "u1",
    });

    expect(result).toMatchObject({
      action: {
        custom_text: "write a note on the receipt",
        item_id: "custom:write a note on the receipt",
        kind: "custom_scene_action",
        label: "write a note on the receipt",
        scene_id: "restaurant",
        tone: "neutral",
      },
      ok: true,
    });
  });

  it("rejects custom scene actions without a current scene", async () => {
    const result = await validateQuickAction(createEnv(), {
      companionId: "maya",
      now: 10_000,
      raw: { text: "wave from the doorway", type: "custom_scene_action" },
      scene: null,
      userId: "u1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(422);
      await expect(result.response.json()).resolves.toMatchObject({ error: "quick_action_requires_scene" });
    }
  });

  it("rejects empty or too-long custom scene actions", async () => {
    const empty = await validateQuickAction(createEnv(), {
      companionId: "maya",
      now: 10_000,
      raw: { text: "   ", type: "custom_scene_action" },
      scene: cafeScene,
      userId: "u1",
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.response.status).toBe(400);
      await expect(empty.response.json()).resolves.toMatchObject({ error: "invalid_quick_action" });
    }

    const longText = "x".repeat(121);
    const tooLong = await validateQuickAction(createEnv(), {
      companionId: "maya",
      now: 10_000,
      raw: { text: longText, type: "custom_scene_action" },
      scene: cafeScene,
      userId: "u1",
    });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.response.status).toBe(400);
      await expect(tooLong.response.json()).resolves.toMatchObject({ error: "invalid_quick_action" });
    }
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
      { key: "scene:skyline_roof_garden", kind: "scene", label: "New place unlocked: Skyline Roof Garden", scene_id: "skyline_roof_garden", scene_name: "Skyline Roof Garden" },
    ]);

    const result = await commitQuickAction(env, {
      action: {
        description: "The user ordered coffee for both of you.",
        item_id: "coffee",
        kind: "gift",
        label: "Order coffee",
        scene_id: "pier_cafe",
        scene_mood: "Warm",
        scene_name: "Pier Cafe",
        scene_tags: ["coffee"],
        tone: "gift",
      },
      companionId: "maya",
      now,
      userId: "u1",
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.[1]).toBe("u1");
    expect(inserts[0]?.[2]).toBe("maya");
    expect(inserts[0]?.[3]).toBe("pier_cafe");
    expect(JSON.parse(String(inserts[0]?.[5]))).toMatchObject({ item_id: "coffee", quick_action: true });
    expect(quickMocks.onActivityCompleted).toHaveBeenCalledWith(env, expect.objectContaining({
      activity_type: "gift",
      companion_id: "maya",
      metadata: expect.objectContaining({ item_id: "coffee", quick_action: true, type: "gift" }),
      user_id: "u1",
    }));
    expect(quickMocks.applySignals).toHaveBeenCalledWith(env, "u1", "maya", { closeness: 1, trust: 1 }, now);
    expect(result).toMatchObject({ item_id: "coffee" });
    expect(result.unlocks.map((unlock) => unlock.key)).toEqual(["title:familiar", "scene:skyline_roof_garden"]);
  });

  it("creates completed scene action activities and applies catalog relationship delta", async () => {
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
      dimensions: { ...ZERO_DIMENSIONS, tension: 3, trust: -3 },
      first_met_at: 1,
      last_interaction_at: now,
      level: "Strained",
    });
    quickMocks.detectAndRecordUnlocks.mockResolvedValue({ newlyUnlocked: [], stage: "strained" });
    quickMocks.detectNewSceneUnlocks.mockResolvedValue([]);

    const result = await commitQuickAction(env, {
      action: {
        action_id: "restaurant_skip_bill",
        description: "The user tries to leave without paying the restaurant bill.",
        item_id: "restaurant_skip_bill",
        kind: "scene_action",
        label: "Skip the bill",
        label_zh: "逃单",
        scene_id: "restaurant",
        scene_mood: "Warm",
        scene_name: "Restaurant",
        scene_tags: ["restaurant"],
        tone: "negative",
      },
      companionId: "maya",
      now,
      userId: "u1",
    });

    expect(inserts).toHaveLength(1);
    expect(JSON.parse(String(inserts[0]?.[5]))).toMatchObject({
      action_id: "restaurant_skip_bill",
      item_id: "restaurant_skip_bill",
      label: "Skip the bill",
      label_zh: "逃单",
      quick_action: true,
      tone: "negative",
      type: "scene_action",
    });
    expect(quickMocks.applySignals).toHaveBeenCalledWith(env, "u1", "maya", { closeness: -1, tension: 3, trust: -3 }, now);
    expect(result).toMatchObject({ item_id: "restaurant_skip_bill" });
  });

  it("creates completed custom scene action activities without fixed relationship delta", async () => {
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
      dimensions: { ...ZERO_DIMENSIONS },
      first_met_at: 1,
      last_interaction_at: now,
      level: "Stranger",
    });
    quickMocks.detectAndRecordUnlocks.mockResolvedValue({ newlyUnlocked: [], stage: "first_contact" });
    quickMocks.detectNewSceneUnlocks.mockResolvedValue([]);

    const result = await commitQuickAction(env, {
      action: {
        custom_text: "draw a heart on the foggy window",
        description: "The user just did this visible action in the current scene: draw a heart on the foggy window",
        item_id: "custom:draw a heart on the foggy window",
        kind: "custom_scene_action",
        label: "draw a heart on the foggy window",
        label_zh: "draw a heart on the foggy window",
        scene_id: "pier_cafe",
        scene_mood: "Warm",
        scene_name: "Pier Cafe",
        scene_tags: ["coffee"],
        tone: "neutral",
      },
      companionId: "maya",
      now,
      userId: "u1",
    });

    expect(inserts).toHaveLength(1);
    expect(JSON.parse(String(inserts[0]?.[5]))).toMatchObject({
      custom_action: true,
      custom_text: "draw a heart on the foggy window",
      item_id: "custom:draw a heart on the foggy window",
      quick_action: true,
      tone: "neutral",
      type: "custom_scene_action",
    });
    expect(quickMocks.applySignals).toHaveBeenCalledWith(env, "u1", "maya", {}, now);
    expect(result).toMatchObject({ item_id: "custom:draw a heart on the foggy window" });
  });
});
