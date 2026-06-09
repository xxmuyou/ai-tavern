import { describe, expect, it } from "vitest";

import { applySignals, ensureRelationship, loadRelationship } from "./engine";
import { ZERO_DIMENSIONS } from "./level";

type RelationshipFixture = {
  user_id: string;
  companion_id: string;
  closeness: number;
  trust: number;
  romance: number;
  friendship: number;
  hostility: number;
  tension: number;
  distance: number;
  level_label: string;
  last_stage?: string;
  first_met_at: number;
  last_interaction_at: number;
};

type CompanionRow = { relationship_role: string | null; initial_dims: string | null };

describe("relationship engine", () => {
  it("ensureRelationship inserts a zero row when companion has no role/initial_dims", async () => {
    const env = createEnv();
    await ensureRelationship(env, "user-1", "maya", 1747700000000);
    const state = await loadRelationship(env, "user-1", "maya");
    expect(state).not.toBeNull();
    expect(state?.dimensions).toEqual(ZERO_DIMENSIONS);
    expect(state?.level).toBe("Stranger");
    expect(state?.first_met_at).toBe(1747700000000);
  });

  it("ensureRelationship is idempotent (second call preserves first_met_at)", async () => {
    const env = createEnv();
    await ensureRelationship(env, "user-1", "maya", 1000);
    await ensureRelationship(env, "user-1", "maya", 9999);
    const state = await loadRelationship(env, "user-1", "maya");
    expect(state?.first_met_at).toBe(1000);
  });

  it("ensureRelationship seeds from companion.initial_dims (precedence over role)", async () => {
    const env = createEnv(
      new Map([
        [
          "maya",
          {
            relationship_role: "crush", // would seed romance 14; initial_dims must win
            initial_dims:
              '{"closeness":30,"trust":0,"romance":35,"friendship":0,"hostility":0,"tension":0,"distance":0}',
          },
        ],
      ]),
    );
    await ensureRelationship(env, "user-1", "maya", 1000);
    const state = await loadRelationship(env, "user-1", "maya");
    expect(state?.dimensions.closeness).toBe(30);
    expect(state?.dimensions.romance).toBe(35);
    expect(state?.level).toBe("Romantic Interest"); // romance>30
  });

  it("ensureRelationship falls back to relationship_role default when initial_dims is null", async () => {
    const env = createEnv(new Map([["maya", { relationship_role: "crush", initial_dims: null }]]));
    await ensureRelationship(env, "user-1", "maya", 1000);
    const state = await loadRelationship(env, "user-1", "maya");
    // crush default: closeness 22, romance 14 -> Acquaintance / familiar, not Stranger
    expect(state?.dimensions.closeness).toBe(22);
    expect(state?.dimensions.romance).toBe(14);
    expect(state?.level).toBe("Acquaintance");
  });

  it("ensureRelationship silently pre-grants the familiar milestone for a seeded non-stranger role", async () => {
    const env = createEnv(new Map([["maya", { relationship_role: "friend", initial_dims: null }]]));
    await ensureRelationship(env, "user-1", "maya", 1000);
    expect(env.__unlocks.has("user-1|maya|title:familiar")).toBe(true);
    // but NOT the higher milestones (friend stays in familiar stage)
    expect(env.__unlocks.has("user-1|maya|secret")).toBe(false);
  });

  it("ensureRelationship grants no milestones for a stranger seed", async () => {
    const env = createEnv(new Map([["maya", { relationship_role: "stranger", initial_dims: null }]]));
    await ensureRelationship(env, "user-1", "maya", 1000);
    expect(env.__unlocks.size).toBe(0);
  });

  it("applySignals creates relationship + updates dimensions", async () => {
    const env = createEnv();
    const state = await applySignals(
      env,
      "user-1",
      "maya",
      { closeness: 3, romance: 2, friendship: 1 },
      1747700000000,
    );

    expect(state.dimensions.closeness).toBe(3);
    expect(state.dimensions.romance).toBe(2);
    expect(state.dimensions.friendship).toBe(1);
    expect(state.dimensions.trust).toBe(0);
    expect(state.last_interaction_at).toBe(1747700000000);
    expect(state.level).toBe("Stranger"); // 3/2/1 are too low to promote
  });

  it("applySignals clamps each signal to [-5, +5]", async () => {
    const env = createEnv();
    const state = await applySignals(
      env,
      "user-1",
      "maya",
      { closeness: 99, hostility: -99 } as unknown as Record<string, number>,
      1000,
    );
    // closeness signal clamped to +5, applied to 0 = 5
    expect(state.dimensions.closeness).toBe(5);
    // negative signal: clamped to -5, applied to 0 => clamped to 0
    expect(state.dimensions.hostility).toBe(0);
  });

  it("applySignals clamps dimensions to [0, 100] across multiple calls", async () => {
    const env = createEnv();
    for (let i = 0; i < 30; i += 1) {
      await applySignals(env, "user-1", "maya", { closeness: 5 }, 1000 + i);
    }
    const state = await loadRelationship(env, "user-1", "maya");
    expect(state?.dimensions.closeness).toBe(100);
  });

  it("applySignals recomputes level after dimensions move past thresholds", async () => {
    const env = createEnv();
    // Push closeness past 20 (Acquaintance), then past 40 with friendship 30 (Friend)
    for (let i = 0; i < 9; i += 1) {
      await applySignals(env, "user-1", "maya", { closeness: 5, friendship: 4 }, 1000 + i);
    }
    const state = await loadRelationship(env, "user-1", "maya");
    expect(state?.dimensions.closeness).toBe(45);
    expect(state?.dimensions.friendship).toBe(36);
    expect(state?.level).toBe("Friend");
  });
});

// -----------------------------------------------------------------------------
// In-memory mock D1
// -----------------------------------------------------------------------------

type MockEnv = Env & { __unlocks: Set<string> };

function createEnv(companions: Map<string, CompanionRow> = new Map()): MockEnv {
  const relationships = new Map<string, RelationshipFixture>();
  const unlocks = new Set<string>();

  const DB = {
    prepare(sql: string) {
      return buildStatement(sql, relationships, companions, unlocks);
    },
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      for (const stmt of statements) await stmt.run();
    },
  };

  return { DB, __unlocks: unlocks } as unknown as MockEnv;
}

function key(userId: string, companionId: string): string {
  return `${userId}|${companionId}`;
}

function buildStatement(
  sql: string,
  relationships: Map<string, RelationshipFixture>,
  companions: Map<string, CompanionRow>,
  unlocks: Set<string>,
) {
  const exec = (values: unknown[]) => ({
    async first<T>(): Promise<T | null> {
      if (sql.includes("FROM companions") && sql.includes("WHERE id = ?")) {
        return (companions.get(values[0] as string) ?? null) as T | null;
      }
      if (sql.includes("FROM relationships") && sql.includes("WHERE user_id = ? AND companion_id = ?")) {
        const k = key(values[0] as string, values[1] as string);
        return (relationships.get(k) ?? null) as T | null;
      }
      return null;
    },
    async all<T>(): Promise<{ results: T[] }> {
      return { results: [] };
    },
    async run() {
      if (sql.includes("INSERT OR IGNORE INTO relationships")) {
        const [
          userId,
          companionId,
          closeness,
          trust,
          romance,
          friendship,
          hostility,
          tension,
          distance,
          level_label,
          firstMet,
          lastInteraction,
        ] = values as [string, string, number, number, number, number, number, number, number, string, number, number];
        const k = key(userId, companionId);
        if (!relationships.has(k)) {
          relationships.set(k, {
            closeness,
            companion_id: companionId,
            distance,
            first_met_at: firstMet,
            friendship,
            hostility,
            last_interaction_at: lastInteraction,
            level_label,
            romance,
            tension,
            trust,
            user_id: userId,
          });
        }
        return { meta: { changes: 1 } };
      }
      if (sql.includes("INSERT OR IGNORE INTO relationship_unlocks")) {
        const [userId, companionId, unlockKey] = values as [string, string, string, number];
        unlocks.add(`${userId}|${companionId}|${unlockKey}`);
        return { meta: { changes: 1 } };
      }
      if (sql.startsWith("UPDATE relationships") && sql.includes("SET closeness = ?")) {
        const [
          closeness,
          trust,
          romance,
          friendship,
          hostility,
          tension,
          distance,
          level_label,
          lastInteraction,
          userId,
          companionId,
        ] = values as [number, number, number, number, number, number, number, string, number, string, string];
        const k = key(userId, companionId);
        const existing = relationships.get(k);
        if (existing) {
          relationships.set(k, {
            ...existing,
            closeness,
            distance,
            friendship,
            hostility,
            last_interaction_at: lastInteraction,
            level_label,
            romance,
            tension,
            trust,
          });
        }
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
  });

  return {
    ...exec([]),
    bind(...values: unknown[]) {
      return exec(values);
    },
  };
}
