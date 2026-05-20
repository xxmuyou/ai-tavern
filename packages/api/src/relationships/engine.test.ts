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
  first_met_at: number;
  last_interaction_at: number;
};

describe("relationship engine", () => {
  it("ensureRelationship inserts a zero row on first call", async () => {
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

function createEnv(): Env {
  const relationships = new Map<string, RelationshipFixture>();

  return {
    DB: {
      prepare(sql: string) {
        return buildStatement(sql, relationships);
      },
    },
  } as unknown as Env;
}

function key(userId: string, companionId: string): string {
  return `${userId}|${companionId}`;
}

function buildStatement(sql: string, relationships: Map<string, RelationshipFixture>) {
  const exec = (values: unknown[]) => ({
    async first<T>(): Promise<T | null> {
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
        const [userId, companionId, firstMet, lastInteraction] = values as [
          string,
          string,
          number,
          number,
        ];
        const k = key(userId, companionId);
        if (!relationships.has(k)) {
          relationships.set(k, {
            closeness: 0,
            companion_id: companionId,
            distance: 0,
            first_met_at: firstMet,
            friendship: 0,
            hostility: 0,
            last_interaction_at: lastInteraction,
            level_label: "Stranger",
            romance: 0,
            tension: 0,
            trust: 0,
            user_id: userId,
          });
        }
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
        ] = values as [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          string,
          number,
          string,
          string,
        ];
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
