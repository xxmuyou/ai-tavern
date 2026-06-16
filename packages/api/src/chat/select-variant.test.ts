import { describe, expect, it } from "vitest";

import { createSessionsStore, issueTestSessionToken, type SessionsStore } from "../auth/test-fixtures";
import { handleSelectVariant } from "./select-variant";

type MessageState = {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  variants: string | null;
  selected_variant: number | null;
};

describe("handleSelectVariant", () => {
  it("selects a stored variant and updates the message content", async () => {
    const message: MessageState = {
      content: "v2",
      id: "m1",
      role: "companion",
      selected_variant: 2,
      thread_id: "t-1",
      variants: JSON.stringify(["v0", "v1", "v2"]),
    };
    const env = createEnv(message);
    const token = await issueTestSessionToken(env, "player@example.com");

    const res = await handleSelectVariant(
      reqWithBody(token, { index: 0 }),
      env,
      { email: "player@example.com", id: "user-1" },
      "c-1",
      "m1",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string; selected_variant: number };
    expect(body.content).toBe("v0");
    expect(body.selected_variant).toBe(0);
    expect(message.content).toBe("v0");
    expect(message.selected_variant).toBe(0);
  });

  it("sanitizes malformed tags when selecting an old variant", async () => {
    const message: MessageState = {
      content: "v1",
      id: "m1",
      role: "companion",
      selected_variant: 1,
      thread_id: "t-1",
      variants: JSON.stringify(["<x narration>旧。</x narration>Hi<stage>bad</stage>", "v1"]),
    };
    const env = createEnv(message);
    const token = await issueTestSessionToken(env, "player@example.com");

    const res = await handleSelectVariant(
      reqWithBody(token, { index: 0 }),
      env,
      { email: "player@example.com", id: "user-1" },
      "c-1",
      "m1",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string; variants: string[] };
    expect(body.content).toBe("<narration>旧。</narration>Hibad");
    expect(body.variants[0]).toBe("<narration>旧。</narration>Hibad");
    expect(message.content).toBe("<narration>旧。</narration>Hibad");
  });

  it("rejects an out-of-range index", async () => {
    const message: MessageState = {
      content: "v0",
      id: "m1",
      role: "companion",
      selected_variant: 0,
      thread_id: "t-1",
      variants: JSON.stringify(["v0", "v1"]),
    };
    const env = createEnv(message);
    const token = await issueTestSessionToken(env, "player@example.com");

    const res = await handleSelectVariant(
      reqWithBody(token, { index: 5 }),
      env,
      { email: "player@example.com", id: "user-1" },
      "c-1",
      "m1",
    );
    expect(res.status).toBe(400);
  });

  it("404s for a non-companion message", async () => {
    const message: MessageState = {
      content: "hi",
      id: "m1",
      role: "user",
      selected_variant: null,
      thread_id: "t-1",
      variants: null,
    };
    const env = createEnv(message);
    const token = await issueTestSessionToken(env, "player@example.com");

    const res = await handleSelectVariant(
      reqWithBody(token, { index: 0 }),
      env,
      { email: "player@example.com", id: "user-1" },
      "c-1",
      "m1",
    );
    expect(res.status).toBe(404);
  });
});

function reqWithBody(token: string, body: unknown): Request {
  return new Request("http://localhost/chat/c-1/messages/m1/variant", {
    body: JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    method: "POST",
  });
}

function createEnv(message: MessageState): Env {
  const users = new Map<string, { id: string; email: string }>();
  users.set("player@example.com", { email: "player@example.com", id: "user-1" });
  const sessionsStore = createSessionsStore();

  return {
    APP_ENV: "dev",
    AUTH_TOKEN_SECRET: "test-auth-secret",
    DB: {
      prepare(sql: string) {
        return buildStatement(sql, message, users, sessionsStore);
      },
    },
  } as unknown as Env;
}

function buildStatement(
  sql: string,
  message: MessageState,
  users: Map<string, { id: string; email: string }>,
  sessionsStore: SessionsStore,
) {
  const statementFor = (values: unknown[]) => ({
    async all<T>(): Promise<{ results: T[] }> {
      return { results: [] as T[] };
    },
    async first<T>(): Promise<T | null> {
      const sessionResult = sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "first") {
        return sessionResult.result as unknown as T | null;
      }
      if (sql.includes("FROM users") && sql.includes("WHERE email = ?")) {
        return (users.get(values[0] as string) ?? null) as T | null;
      }
      if (sql.includes("FROM companions")) {
        return { created_by: null, id: "c-1", is_active: 1, source: "official" } as unknown as T;
      }
      if (sql.includes("FROM threads")) {
        return {
          created_at: 0,
          id: "t-1",
          message_count: 2,
          persona_id: null,
          summary: null,
          updated_at: 0,
        } as unknown as T;
      }
      if (sql.includes("FROM messages") && sql.includes("WHERE id = ? AND thread_id = ?")) {
        return { ...message } as unknown as T;
      }
      return null;
    },
    async run() {
      const sessionResult = sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "run") {
        return sessionResult.result;
      }
      if (sql.includes("INSERT OR IGNORE INTO users")) {
        return { meta: { changes: 1 } };
      }
      if (sql.startsWith("UPDATE messages SET content = ?, selected_variant = ?")) {
        message.content = values[0] as string;
        message.selected_variant = values[1] as number;
      }
      return { meta: { changes: 1 } };
    },
  });

  const unbound = statementFor([]);
  return {
    ...unbound,
    bind(...values: unknown[]) {
      return statementFor(values);
    },
  };
}
