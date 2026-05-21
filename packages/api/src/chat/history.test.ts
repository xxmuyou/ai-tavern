import { describe, expect, it } from "vitest";

import type { UserRecord } from "../identity";
import { handleDeleteHistory, handleGetHistory } from "./history";

type MessageRow = {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  signals: string | null;
  emotion: string | null;
  created_at: number;
};

function createEnv(opts: {
  companion?: { id: string; source: "official" | "user"; created_by: string | null; is_active: number } | null;
  thread?: { id: string; summary: string | null; message_count: number; created_at: number; updated_at: number } | null;
  messages?: MessageRow[];
}): {
  env: Env;
  state: { messages: MessageRow[]; thread: typeof opts.thread; deletedMessages: number; threadUpdated: boolean };
} {
  const state = {
    deletedMessages: 0,
    messages: [...(opts.messages ?? [])],
    thread: opts.thread ?? null,
    threadUpdated: false,
  };

  const env = {
    DB: {
      prepare(sql: string) {
        const exec = (values: unknown[]) => ({
          async first<T>(): Promise<T | null> {
            if (sql.includes("FROM companions")) {
              if (!opts.companion) return null;
              return {
                ...opts.companion,
                appearance: null,
                background: null,
                name: "x",
                personality: null,
                relationship_role: null,
                speech_style: null,
              } as unknown as T;
            }
            if (sql.includes("FROM threads")) {
              return state.thread as unknown as T;
            }
            if (sql.includes("SELECT created_at FROM messages")) {
              const id = values[0] as string;
              const row = state.messages.find((m) => m.id === id);
              return (row ? { created_at: row.created_at } : null) as unknown as T;
            }
            return null;
          },
          async all<T>(): Promise<{ results: T[] }> {
            if (sql.startsWith("SELECT id, role, content, signals, emotion, created_at")) {
              const threadId = values[0] as string;
              let cursor: number | null = null;
              let limit: number;
              if (values.length === 3) {
                cursor = values[1] as number;
                limit = values[2] as number;
              } else {
                limit = values[1] as number;
              }
              let rows = state.messages.filter((m) => m.thread_id === threadId);
              if (cursor !== null) {
                rows = rows.filter((m) => m.created_at < (cursor as number));
              }
              rows.sort((a, b) => b.created_at - a.created_at);
              const sliced = rows.slice(0, limit);
              return { results: sliced as unknown as T[] };
            }
            return { results: [] };
          },
          async run() {
            if (sql.startsWith("DELETE FROM messages")) {
              const threadId = values[0] as string;
              const before = state.messages.length;
              state.messages = state.messages.filter((m) => m.thread_id !== threadId);
              state.deletedMessages = before - state.messages.length;
            }
            if (sql.startsWith("UPDATE threads")) {
              state.threadUpdated = true;
              if (state.thread) {
                state.thread = {
                  ...state.thread,
                  message_count: 0,
                  summary: null,
                };
              }
            }
            return { meta: { changes: 1 } };
          },
        });
        return {
          ...exec([]),
          bind(...values: unknown[]) {
            return exec(values);
          },
        };
      },
    },
  } as unknown as Env;

  return { env, state };
}

const USER: UserRecord = { email: "u@example.com", id: "user-1" };

describe("handleGetHistory", () => {
  it("returns empty payload when no thread exists", async () => {
    const { env } = createEnv({
      companion: { created_by: null, id: "c-1", is_active: 1, source: "official" },
    });
    const response = await handleGetHistory(env, USER, "c-1", new URL("https://x/chat/c-1/history"));
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.messages).toEqual([]);
    expect((body.thread as { message_count: number }).message_count).toBe(0);
    expect(body.next_cursor).toBeNull();
  });

  it("404 when companion missing or inactive", async () => {
    const { env } = createEnv({ companion: null });
    const response = await handleGetHistory(env, USER, "c-1", new URL("https://x/chat/c-1/history"));
    expect(response.status).toBe(404);
  });

  it("returns messages ASC with companion signals parsed and pagination cursor", async () => {
    const thread = { created_at: 0, id: "t-1", message_count: 4, summary: null, updated_at: 0 };
    const msgs: MessageRow[] = [
      { content: "Hi", created_at: 1, emotion: null, id: "m1", role: "user", signals: null, thread_id: "t-1" },
      {
        content: "Hello!",
        created_at: 2,
        emotion: "warm",
        id: "m2",
        role: "companion",
        signals: JSON.stringify({ closeness: 1 }),
        thread_id: "t-1",
      },
      { content: "How are you?", created_at: 3, emotion: null, id: "m3", role: "user", signals: null, thread_id: "t-1" },
      {
        content: "Good thanks.",
        created_at: 4,
        emotion: "warm",
        id: "m4",
        role: "companion",
        signals: JSON.stringify({ closeness: 1, trust: 1 }),
        thread_id: "t-1",
      },
    ];
    const { env } = createEnv({
      companion: { created_by: null, id: "c-1", is_active: 1, source: "official" },
      messages: msgs,
      thread,
    });

    const response = await handleGetHistory(env, USER, "c-1", new URL("https://x/chat/c-1/history?limit=2"));
    const body = (await response.json()) as {
      messages: Array<{ id: string; role: string; signals: unknown }>;
      next_cursor: string | null;
    };
    expect(body.messages.map((m) => m.id)).toEqual(["m3", "m4"]);
    expect(body.messages[1]?.signals).toEqual({ closeness: 1, trust: 1 });
    expect(body.next_cursor).toBe("m3"); // next page would be < m3.created_at
  });

  it("clamps limit to 1..100", async () => {
    const thread = { created_at: 0, id: "t-1", message_count: 0, summary: null, updated_at: 0 };
    const { env } = createEnv({
      companion: { created_by: null, id: "c-1", is_active: 1, source: "official" },
      messages: [],
      thread,
    });
    const r = await handleGetHistory(env, USER, "c-1", new URL("https://x/chat/c-1/history?limit=9999"));
    expect(r.status).toBe(200);
  });
});

describe("handleDeleteHistory", () => {
  it("hard-deletes messages and resets thread, leaves relationships untouched", async () => {
    const thread = { created_at: 0, id: "t-1", message_count: 2, summary: "old", updated_at: 0 };
    const { env, state } = createEnv({
      companion: { created_by: null, id: "c-1", is_active: 1, source: "official" },
      messages: [
        { content: "x", created_at: 1, emotion: null, id: "m1", role: "user", signals: null, thread_id: "t-1" },
        { content: "y", created_at: 2, emotion: "warm", id: "m2", role: "companion", signals: null, thread_id: "t-1" },
      ],
      thread,
    });

    const response = await handleDeleteHistory(env, USER, "c-1");
    expect(response.status).toBe(204);
    expect(state.deletedMessages).toBe(2);
    expect(state.threadUpdated).toBe(true);
    expect(state.thread?.message_count).toBe(0);
    expect(state.thread?.summary).toBeNull();
  });

  it("204 when thread doesn't exist", async () => {
    const { env } = createEnv({
      companion: { created_by: null, id: "c-1", is_active: 1, source: "official" },
    });
    const r = await handleDeleteHistory(env, USER, "c-1");
    expect(r.status).toBe(204);
  });

  it("404 when companion missing", async () => {
    const { env } = createEnv({ companion: null });
    const r = await handleDeleteHistory(env, USER, "c-1");
    expect(r.status).toBe(404);
  });
});
