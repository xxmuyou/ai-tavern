import { describe, expect, it } from "vitest";

import { createSessionsStore, issueTestSessionToken, type SessionsStore } from "../auth/test-fixtures";
import { FREE_MEMORY_CAP } from "./config";
import { handleMemoryRequest, onActivityMemoryHook } from "./memory";

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
      scene_id: "underground_livehouse",
      activity_type: "hang_out",
      completed_at: 1000,
      daily_state_snapshot: JSON.stringify({ mood: "calm", availability: "available", activity_hint: "reading", scene_id: "underground_livehouse" }),
      metadata: null,
    });

    expect(memories.map((m) => m.memory_type).sort()).toEqual(["first_hangout", "first_meeting"]);
  });

  it("second hang_out does not duplicate first_hangout", async () => {
    const { env, memories } = buildEnv();
    const base = {
      user_id: "u1",
      companion_id: "maya",
      scene_id: "underground_livehouse",
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
      scene_id: "underground_livehouse",
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
      scene_id: "underground_livehouse",
      activity_type: "check_in",
      completed_at: 1000,
      daily_state_snapshot: "{}",
      metadata: null,
    });
    expect(memories.map((m) => m.memory_type)).toEqual(["first_meeting"]);
  });
});

describe("handleMemoryRequest", () => {
  it("lists all current-user memories when companion_id is omitted", async () => {
    const env = buildRouteEnv({
      companions: [
        { art_url: "portraits/maya.webp", id: "maya", name: "Maya Chen" },
        { art_url: "portraits/iris.webp", id: "iris", name: "Iris Park" },
      ],
      memories: [
        memory("mem-old", "user-1", "maya", 1_000),
        memory("mem-new", "user-1", "iris", 2_000),
        memory("mem-other", "user-2", "maya", 3_000),
      ],
      profileImages: [{ art_key: "user-art/user-1/maya.webp", companion_id: "maya", user_id: "user-1" }],
    });
    const token = await issueTestSessionToken(env, "player@example.com");

    const response = await handleMemoryRequest(routeReq("http://localhost/memories", token), env, "/memories");
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as MemoryListBody;

    expect(body.total).toBe(2);
    expect(body.memories.map((item) => item.id)).toEqual(["mem-new", "mem-old"]);
    expect(body.memories[0]?.companion).toEqual({ art_url: "portraits/iris.webp", id: "iris", name: "Iris Park" });
    expect(body.memories[1]?.companion).toEqual({ art_url: "user-art/user-1/maya.webp", id: "maya", name: "Maya Chen" });
  });

  it("filters memories by companion_id when provided", async () => {
    const env = buildRouteEnv({
      companions: [
        { art_url: "portraits/maya.webp", id: "maya", name: "Maya Chen" },
        { art_url: "portraits/iris.webp", id: "iris", name: "Iris Park" },
      ],
      memories: [
        memory("mem-maya", "user-1", "maya", 1_000),
        memory("mem-iris", "user-1", "iris", 2_000),
      ],
    });
    const token = await issueTestSessionToken(env, "player@example.com");

    const response = await handleMemoryRequest(routeReq("http://localhost/memories?companion_id=maya", token), env, "/memories");
    const body = (await response?.json()) as MemoryListBody;

    expect(body.total).toBe(1);
    expect(body.memories.map((item) => item.id)).toEqual(["mem-maya"]);
  });

  it("caps free album responses and reports truncation", async () => {
    const env = buildRouteEnv({
      companions: [{ art_url: "portraits/maya.webp", id: "maya", name: "Maya Chen" }],
      memories: Array.from({ length: FREE_MEMORY_CAP + 1 }, (_, index) => memory(`mem-${index}`, "user-1", "maya", index)),
    });
    const token = await issueTestSessionToken(env, "player@example.com");

    const response = await handleMemoryRequest(routeReq("http://localhost/memories?limit=200", token), env, "/memories");
    const body = (await response?.json()) as MemoryListBody;

    expect(body.memories).toHaveLength(FREE_MEMORY_CAP);
    expect(body.total).toBe(FREE_MEMORY_CAP + 1);
    expect(body.capacity_limit).toBe(FREE_MEMORY_CAP);
    expect(body.truncated).toBe(true);
  });

  it("does not apply the free album cap to pro users", async () => {
    const env = buildRouteEnv({
      companions: [{ art_url: "portraits/maya.webp", id: "maya", name: "Maya Chen" }],
      memories: Array.from({ length: FREE_MEMORY_CAP + 1 }, (_, index) => memory(`mem-${index}`, "user-1", "maya", index)),
      proUserIds: ["user-1"],
    });
    const token = await issueTestSessionToken(env, "player@example.com");

    const response = await handleMemoryRequest(routeReq("http://localhost/memories?limit=200", token), env, "/memories");
    const body = (await response?.json()) as MemoryListBody;

    expect(body.memories).toHaveLength(FREE_MEMORY_CAP + 1);
    expect(body.capacity_limit).toBeNull();
    expect(body.truncated).toBe(false);
  });
});

type CompanionFixture = {
  art_url: string | null;
  id: string;
  name: string;
};

type MemoryListBody = {
  capacity_limit: number | null;
  memories: Array<{
    companion: { art_url: string | null; id: string; name: string } | null;
    companion_id: string;
    id: string;
  }>;
  total: number;
  truncated: boolean;
};

type ProfileImageFixture = {
  art_key: string;
  companion_id: string;
  user_id: string;
};

function memory(id: string, userId: string, companionId: string, createdAt: number): MemoryRow {
  return {
    activity_id: null,
    cg_template: null,
    cg_url: null,
    companion_id: companionId,
    created_at: createdAt,
    id,
    key_choice: null,
    memory_subtype: "",
    memory_type: "first_meeting",
    relationship_delta: null,
    scene_id: null,
    summary: "A remembered moment.",
    title: "A memory",
    user_id: userId,
  };
}

function routeReq(url: string, token: string): Request {
  return new Request(url, {
    headers: { authorization: `Bearer ${token}` },
  });
}

function buildRouteEnv(input: {
  companions?: CompanionFixture[];
  memories?: MemoryRow[];
  profileImages?: ProfileImageFixture[];
  proUserIds?: string[];
}): Env {
  const users = new Map<string, { id: string; email: string }>();
  users.set("player@example.com", { email: "player@example.com", id: "user-1" });
  const state = {
    companions: new Map((input.companions ?? []).map((row) => [row.id, row])),
    memories: input.memories ?? [],
    profileImages: input.profileImages ?? [],
    proUserIds: new Set(input.proUserIds ?? []),
    sessionsStore: createSessionsStore(),
    users,
  };

  return {
    APP_ENV: "dev",
    AUTH_TOKEN_SECRET: "test-auth-secret",
    DB: {
      prepare(sql: string) {
        return buildRouteStatement(sql, state);
      },
    },
  } as unknown as Env;
}

function buildRouteStatement(
  sql: string,
  state: {
    companions: Map<string, CompanionFixture>;
    memories: MemoryRow[];
    profileImages: ProfileImageFixture[];
    proUserIds: Set<string>;
    sessionsStore: SessionsStore;
    users: Map<string, { id: string; email: string }>;
  },
) {
  const normalized = sql.replace(/\s+/g, " ").trim();
  const exec = (values: unknown[]) => ({
    async all<T>(): Promise<{ results: T[] }> {
      if (normalized.startsWith("SELECT m.id, m.user_id, m.companion_id")) {
        const limit = Number(values[values.length - 1] ?? 50);
        const rows = filterRouteMemories(normalized, values, state)
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, limit)
          .map((row) => withCompanion(row, state));
        return { results: rows as unknown as T[] };
      }
      return { results: [] };
    },
    async first<T>(): Promise<T | null> {
      const sessionResult = state.sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "first") return sessionResult.result as unknown as T | null;
      if (normalized.includes("FROM users") && normalized.includes("WHERE email = ?")) {
        return (state.users.get(values[0] as string) ?? null) as T | null;
      }
      if (normalized.includes("FROM users") && normalized.includes("WHERE id = ?")) {
        return ([...state.users.values()].find((user) => user.id === values[0]) ?? null) as T | null;
      }
      if (normalized.includes("FROM billing_subscriptions")) {
        const userId = values[0] as string;
        return (state.proUserIds.has(userId) ? { id: "sub-test", user_id: userId } : null) as T | null;
      }
      if (normalized.startsWith("SELECT COUNT(*) AS n FROM memories m")) {
        return { n: filterRouteMemories(normalized, values, state).length } as T;
      }
      return null;
    },
    async run() {
      const sessionResult = state.sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "run") return sessionResult.result;
      return { meta: { changes: 1 } };
    },
  });

  return {
    ...exec([]),
    bind(...values: unknown[]) {
      return exec(values);
    },
  };
}

function filterRouteMemories(
  sql: string,
  values: unknown[],
  state: { memories: MemoryRow[] },
): MemoryRow[] {
  const userId = values[0] as string;
  let rows = state.memories.filter((row) => row.user_id === userId);
  if (sql.includes("m.companion_id = ?")) {
    const companionId = values[1] as string;
    rows = rows.filter((row) => row.companion_id === companionId);
  }
  return rows;
}

function withCompanion(
  row: MemoryRow,
  state: {
    companions: Map<string, CompanionFixture>;
    profileImages: ProfileImageFixture[];
  },
): MemoryRow & { companion_art_url: string | null; companion_name: string | null } {
  const companion = state.companions.get(row.companion_id);
  const override = state.profileImages.find((image) => (
    image.user_id === row.user_id && image.companion_id === row.companion_id
  ));
  return {
    ...row,
    companion_art_url: override?.art_key ?? companion?.art_url ?? null,
    companion_name: companion?.name ?? null,
  };
}
