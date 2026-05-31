import { describe, expect, it } from "vitest";

import { ZERO_DIMENSIONS, type DimensionValues } from "./level";
import {
  buildUnlockStatus,
  detectAndRecordUnlocks,
  isEmotionUnlocked,
  isSecretUnlocked,
  unlockKeysForStage,
} from "./unlocks";

function dims(partial: Partial<DimensionValues>): DimensionValues {
  return { ...ZERO_DIMENSIONS, ...partial };
}

describe("unlock rules (pure)", () => {
  it("grants nothing at first_contact, climbs with stage", () => {
    expect(unlockKeysForStage("first_contact")).toEqual([]);
    expect(unlockKeysForStage("familiar")).toEqual(["title:familiar", "expr:playful"]);
    expect(unlockKeysForStage("trusted")).toContain("secret");
    expect(unlockKeysForStage("committed").length).toBe(5);
  });

  it("grants nothing for negative / off-ladder stages", () => {
    expect(unlockKeysForStage("hostile")).toEqual([]);
    expect(unlockKeysForStage("estranged")).toEqual([]);
  });

  it("gates expressions by stage but keeps base emotions always available", () => {
    expect(isEmotionUnlocked("neutral", "first_contact")).toBe(true);
    expect(isEmotionUnlocked("warm", "first_contact")).toBe(true);
    expect(isEmotionUnlocked("guarded", "first_contact")).toBe(true);
    expect(isEmotionUnlocked("annoyed", "first_contact")).toBe(true);

    expect(isEmotionUnlocked("playful", "first_contact")).toBe(false);
    expect(isEmotionUnlocked("playful", "familiar")).toBe(true);
    expect(isEmotionUnlocked("tense", "familiar")).toBe(false);
    expect(isEmotionUnlocked("tense", "trusted")).toBe(true);
  });

  it("builds status for every unlock with the right unlocked flags", () => {
    const status = buildUnlockStatus(new Set(["secret"]));
    expect(status.length).toBe(5);
    expect(status.find((s) => s.key === "secret")?.unlocked).toBe(true);
    expect(status.find((s) => s.key === "title:familiar")?.unlocked).toBe(false);
    expect(isSecretUnlocked(new Set(["secret"]))).toBe(true);
    expect(isSecretUnlocked(new Set(["expr:playful"]))).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// detectAndRecordUnlocks against a minimal in-memory D1 mock
// -----------------------------------------------------------------------------

function createUnlockEnv() {
  const unlocked = new Set<string>();
  let lastStage = "";

  const makeStmt = (sql: string, values: unknown[]) => ({
    async run() {
      if (sql.includes("UPDATE relationships SET last_stage")) {
        lastStage = values[0] as string;
      } else if (sql.includes("INSERT OR IGNORE INTO relationship_unlocks")) {
        unlocked.add(values[2] as string);
      }
      return { meta: { changes: 1 } };
    },
    async all<T>() {
      if (sql.includes("SELECT unlock_key FROM relationship_unlocks")) {
        return { results: [...unlocked].map((unlock_key) => ({ unlock_key })) as T[] };
      }
      return { results: [] as T[] };
    },
  });

  const DB = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return makeStmt(sql, values);
        },
      };
    },
    async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
      for (const s of stmts) await s.run();
      return [];
    },
  };

  return {
    env: { DB } as unknown as Env,
    getLastStage: () => lastStage,
    getUnlocked: () => unlocked,
  };
}

describe("detectAndRecordUnlocks", () => {
  it("grants stage unlocks once, dedups on repeat, and advances", async () => {
    const { env, getLastStage, getUnlocked } = createUnlockEnv();

    const familiar = await detectAndRecordUnlocks(env, "u1", "maya", dims({ closeness: 25 }), 1000);
    expect(familiar.stage).toBe("familiar");
    expect(familiar.newlyUnlocked.map((u) => u.key).sort()).toEqual(
      ["expr:playful", "title:familiar"].sort(),
    );
    expect(getLastStage()).toBe("familiar");

    // Same stage again -> nothing new.
    const again = await detectAndRecordUnlocks(env, "u1", "maya", dims({ closeness: 25 }), 1001);
    expect(again.newlyUnlocked).toEqual([]);

    // Advance to trusted -> only the two new keys are granted.
    const trusted = await detectAndRecordUnlocks(env, "u1", "maya", dims({ trust: 40 }), 1002);
    expect(trusted.stage).toBe("trusted");
    expect(trusted.newlyUnlocked.map((u) => u.key).sort()).toEqual(["expr:tense", "secret"].sort());
    expect(getUnlocked().has("secret")).toBe(true);
  });

  it("records a negative stage without granting, keeping prior unlocks", async () => {
    const { env, getLastStage, getUnlocked } = createUnlockEnv();
    await detectAndRecordUnlocks(env, "u1", "maya", dims({ trust: 40 }), 1000);
    const hostile = await detectAndRecordUnlocks(env, "u1", "maya", dims({ hostility: 80 }), 1001);
    expect(hostile.stage).toBe("hostile");
    expect(hostile.newlyUnlocked).toEqual([]);
    expect(getLastStage()).toBe("hostile");
    expect(getUnlocked().has("secret")).toBe(true);
  });
});
