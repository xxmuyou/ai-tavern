import { describe, expect, it } from "vitest";

import { maybeEmitAnniversaries } from "./anniversary";

type MemoryRow = {
  user_id: string;
  companion_id: string;
  memory_type: string;
  memory_subtype: string;
};

const DAY = 24 * 60 * 60 * 1000;

function buildEnv() {
  const memories: MemoryRow[] = [];

  function exec(sql: string, binds: unknown[]) {
    const s = sql.replace(/\s+/g, " ").trim();
    return {
      async first<T>(): Promise<T | null> {
        if (s.startsWith("SELECT id FROM memories")) {
          const [user_id, companion_id, memory_type, memory_subtype] = binds as [
            string, string, string, string,
          ];
          const row = memories.find(
            (m) => m.user_id === user_id
              && m.companion_id === companion_id
              && m.memory_type === memory_type
              && m.memory_subtype === memory_subtype,
          );
          return (row ? { id: "x" } : null) as T | null;
        }
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        return { results: [] };
      },
      async run() {
        if (s.startsWith("INSERT INTO memories")) {
          const [, user_id, companion_id, memory_type, memory_subtype] = binds as [
            string, string, string, string, string, ...unknown[],
          ];
          memories.push({ user_id, companion_id, memory_type, memory_subtype });
        }
        return { meta: { changes: 1 } };
      },
    };
  }

  const env = {
    DB: {
      prepare(sql: string) {
        return {
          bind(...binds: unknown[]) {
            return exec(sql, binds);
          },
          ...exec(sql, []),
        };
      },
    },
  } as unknown as Env;

  return { env, memories };
}

describe("maybeEmitAnniversaries", () => {
  it("emits nothing under 30 days", async () => {
    const { env, memories } = buildEnv();
    const firstMet = 0;
    await maybeEmitAnniversaries(env, "u1", "maya", firstMet, 29 * DAY);
    expect(memories).toEqual([]);
  });

  it("emits 30d at exactly 30 days", async () => {
    const { env, memories } = buildEnv();
    await maybeEmitAnniversaries(env, "u1", "maya", 0, 30 * DAY);
    expect(memories.map((m) => m.memory_subtype)).toEqual(["30d"]);
  });

  it("backfills 30d + 100d when called at 101 days", async () => {
    const { env, memories } = buildEnv();
    await maybeEmitAnniversaries(env, "u1", "maya", 0, 101 * DAY);
    expect(memories.map((m) => m.memory_subtype).sort()).toEqual(["100d", "30d"]);
  });

  it("emits all three at 365+ days", async () => {
    const { env, memories } = buildEnv();
    await maybeEmitAnniversaries(env, "u1", "maya", 0, 366 * DAY);
    expect(memories.map((m) => m.memory_subtype).sort()).toEqual(["100d", "30d", "365d"]);
  });

  it("is idempotent across repeated calls", async () => {
    const { env, memories } = buildEnv();
    await maybeEmitAnniversaries(env, "u1", "maya", 0, 366 * DAY);
    await maybeEmitAnniversaries(env, "u1", "maya", 0, 366 * DAY);
    expect(memories).toHaveLength(3);
  });
});
