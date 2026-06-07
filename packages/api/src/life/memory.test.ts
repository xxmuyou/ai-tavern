import { describe, expect, it } from "vitest";

import { onActivityMemoryHook } from "./memory";

type MemoryRow = {
  id: string;
  user_id: string;
  companion_id: string;
  memory_type: string;
  memory_subtype: string;
  scene_id: string | null;
  activity_id: string | null;
  title: string;
  summary: string;
  key_choice: string | null;
  relationship_delta: string | null;
  cg_template: string | null;
  cg_url: string | null;
  created_at: number;
};

// Stub Env that supports the subset of SQL used by memory.ts. We
// deliberately do NOT exercise the LLM call here — it falls back to the
// deterministic summary on any error.

function buildEnv(): { env: Env; memories: MemoryRow[] } {
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
          return (row ? { id: row.id } : null) as T | null;
        }
        if (s.includes("FROM llm_config")) {
          throw new Error("no LLM config in tests"); // forces fallback
        }
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        return { results: [] };
      },
      async run() {
        if (s.startsWith("INSERT INTO memories")) {
          const [
            id, user_id, companion_id, memory_type, memory_subtype,
            scene_id, activity_id, title, summary, key_choice,
            relationship_delta, cg_template, cg_url, created_at,
          ] = binds as [
            string, string, string, string, string,
            string | null, string | null, string, string, string | null,
            string | null, string | null, string | null, number,
          ];
          memories.push({
            id,
            user_id,
            companion_id,
            memory_type,
            memory_subtype,
            scene_id,
            activity_id,
            title,
            summary,
            key_choice,
            relationship_delta,
            cg_template,
            cg_url,
            created_at,
          });
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

describe("onActivityMemoryHook", () => {
  it("first hang_out completion emits first_meeting + first_hangout", async () => {
    const { env, memories } = buildEnv();
    await onActivityMemoryHook(env, {
      id: "act1",
      user_id: "u1",
      companion_id: "maya",
      scene_id: "moon_bar",
      activity_type: "hang_out",
      completed_at: 1000,
      daily_state_snapshot: JSON.stringify({ mood: "calm", availability: "available", activity_hint: "reading", scene_id: "moon_bar" }),
      metadata: null,
    });

    expect(memories.map((m) => m.memory_type).sort()).toEqual(["first_hangout", "first_meeting"]);
  });

  it("second hang_out does not duplicate first_hangout", async () => {
    const { env, memories } = buildEnv();
    const base = {
      user_id: "u1",
      companion_id: "maya",
      scene_id: "moon_bar",
      activity_type: "hang_out" as const,
      completed_at: 1000,
      daily_state_snapshot: "{}",
      metadata: null,
    };
    await onActivityMemoryHook(env, { ...base, id: "a1" });
    await onActivityMemoryHook(env, { ...base, id: "a2" });
    const hangouts = memories.filter((m) => m.memory_type === "first_hangout");
    expect(hangouts).toHaveLength(1);
  });

  it("gift activities produce one memory per gift (subtype=activity_id)", async () => {
    const { env, memories } = buildEnv();
    const base = {
      user_id: "u1",
      companion_id: "maya",
      scene_id: "moon_bar",
      activity_type: "gift" as const,
      completed_at: 1000,
      daily_state_snapshot: "{}",
      metadata: null,
    };
    await onActivityMemoryHook(env, { ...base, id: "g1" });
    await onActivityMemoryHook(env, { ...base, id: "g2" });
    const gifts = memories.filter((m) => m.memory_type === "gift_received");
    expect(gifts).toHaveLength(2);
    expect(gifts.map((g) => g.memory_subtype).sort()).toEqual(["g1", "g2"]);
  });

  it("check_in only emits the first_meeting memory once", async () => {
    const { env, memories } = buildEnv();
    await onActivityMemoryHook(env, {
      id: "c1",
      user_id: "u1",
      companion_id: "maya",
      scene_id: "moon_bar",
      activity_type: "check_in",
      completed_at: 1000,
      daily_state_snapshot: "{}",
      metadata: null,
    });
    expect(memories.map((m) => m.memory_type)).toEqual(["first_meeting"]);
  });
});
