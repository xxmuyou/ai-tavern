import { describe, expect, it } from "vitest";

import { createSessionsStore, issueTestSessionToken, type SessionsStore } from "../auth/test-fixtures";
import { handlePersonasRequest } from "./index";

type PersonaRecord = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  gender: string | null;
  is_default: number;
  is_active: number;
  created_at: number;
  updated_at: number;
};

describe("personas module", () => {
  it("rejects unauthenticated GET /personas with 401", async () => {
    const env = createEnv();
    await expect(
      handlePersonasRequest(new Request("http://localhost/personas"), env, "/personas"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("makes the first persona default and lists it", async () => {
    const env = createEnv();
    const token = await issueDevToken(env);

    const created = await handlePersonasRequest(
      req("http://localhost/personas", token, "POST", { description: "a quiet poet", name: "Lin" }),
      env,
      "/personas",
    );
    expect(created?.status).toBe(201);
    const createdBody = (await created?.json()) as { persona: { id: string; is_default: boolean } };
    expect(createdBody.persona.is_default).toBe(true);

    const list = await handlePersonasRequest(req("http://localhost/personas", token), env, "/personas");
    const listBody = (await list?.json()) as { personas: Array<{ name: string; is_default: boolean }> };
    expect(listBody.personas).toHaveLength(1);
    expect(listBody.personas[0]?.name).toBe("Lin");
  });

  it("promoting a second persona demotes the first", async () => {
    const env = createEnv();
    const token = await issueDevToken(env);

    const first = (await (
      await handlePersonasRequest(
        req("http://localhost/personas", token, "POST", { name: "A" }),
        env,
        "/personas",
      )
    )?.json()) as { persona: { id: string } };

    const second = (await (
      await handlePersonasRequest(
        req("http://localhost/personas", token, "POST", { is_default: true, name: "B" }),
        env,
        "/personas",
      )
    )?.json()) as { persona: { id: string; is_default: boolean } };
    expect(second.persona.is_default).toBe(true);

    const list = (await (
      await handlePersonasRequest(req("http://localhost/personas", token), env, "/personas")
    )?.json()) as { personas: Array<{ id: string; is_default: boolean }> };
    const firstNow = list.personas.find((p) => p.id === first.persona.id);
    const secondNow = list.personas.find((p) => p.id === second.persona.id);
    expect(firstNow?.is_default).toBe(false);
    expect(secondNow?.is_default).toBe(true);
  });

  it("deleting the default persona promotes another", async () => {
    const env = createEnv();
    const token = await issueDevToken(env);

    const first = (await (
      await handlePersonasRequest(
        req("http://localhost/personas", token, "POST", { name: "A" }),
        env,
        "/personas",
      )
    )?.json()) as { persona: { id: string } };
    await handlePersonasRequest(
      req("http://localhost/personas", token, "POST", { name: "B" }),
      env,
      "/personas",
    );

    // Delete A (the default).
    const del = await handlePersonasRequest(
      req(`http://localhost/personas/${first.persona.id}`, token, "DELETE"),
      env,
      `/personas/${first.persona.id}`,
    );
    expect(del?.status).toBe(200);

    const list = (await (
      await handlePersonasRequest(req("http://localhost/personas", token), env, "/personas")
    )?.json()) as { personas: Array<{ name: string; is_default: boolean }> };
    expect(list.personas).toHaveLength(1);
    expect(list.personas[0]?.name).toBe("B");
    expect(list.personas[0]?.is_default).toBe(true);
  });

  it("rejects creating a persona without a name", async () => {
    const env = createEnv();
    const token = await issueDevToken(env);
    const res = await handlePersonasRequest(
      req("http://localhost/personas", token, "POST", { description: "no name" }),
      env,
      "/personas",
    );
    expect(res?.status).toBe(400);
  });
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function issueDevToken(env: Env): Promise<string> {
  return issueTestSessionToken(env, "player@example.com");
}

function req(
  url: string,
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Request {
  return new Request(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method,
  });
}

function createEnv(): Env {
  const users = new Map<string, { id: string; email: string }>();
  users.set("player@example.com", { email: "player@example.com", id: "user-1" });
  const sessionsStore = createSessionsStore();
  const personas: PersonaRecord[] = [];

  return {
    APP_ENV: "dev",
    AUTH_TOKEN_SECRET: "test-auth-secret",
    DB: {
      prepare(sql: string) {
        return buildStatement(sql, personas, users, sessionsStore);
      },
    },
  } as unknown as Env;
}

function buildStatement(
  sql: string,
  personas: PersonaRecord[],
  users: Map<string, { id: string; email: string }>,
  sessionsStore: SessionsStore,
) {
  const statementFor = (values: unknown[]) => ({
    async all<T>(): Promise<{ results: T[] }> {
      if (sql.includes("FROM user_personas") && sql.includes("ORDER BY is_default DESC")) {
        const userId = values[0] as string;
        const rows = personas
          .filter((p) => p.user_id === userId && p.is_active === 1)
          .sort((a, b) => b.is_default - a.is_default || a.created_at - b.created_at);
        return { results: rows as unknown as T[] };
      }
      return { results: [] };
    },
    async first<T>(): Promise<T | null> {
      const sessionResult = sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "first") {
        return sessionResult.result as unknown as T | null;
      }
      if (sql.includes("FROM users") && sql.includes("WHERE email = ?")) {
        return (users.get(values[0] as string) ?? null) as T | null;
      }
      if (sql.includes("COUNT(*)") && sql.includes("FROM user_personas")) {
        const userId = values[0] as string;
        const n = personas.filter((p) => p.user_id === userId && p.is_active === 1).length;
        return { n } as unknown as T;
      }
      if (sql.includes("FROM user_personas") && sql.includes("WHERE id = ? AND user_id = ?")) {
        const [id, userId] = values as [string, string];
        const found = personas.find((p) => p.id === id && p.user_id === userId && p.is_active === 1);
        // Real D1 returns a row copy, not a live reference; copy so later UPDATEs
        // do not retroactively mutate what a caller already read.
        return (found ? { ...found } : null) as unknown as T | null;
      }
      if (sql.includes("SELECT id FROM user_personas") && sql.includes("ORDER BY created_at ASC")) {
        const userId = values[0] as string;
        const next = personas
          .filter((p) => p.user_id === userId && p.is_active === 1)
          .sort((a, b) => a.created_at - b.created_at)[0];
        return (next ? { id: next.id } : null) as unknown as T | null;
      }
      return null;
    },
    async run() {
      const sessionResult = sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "run") {
        return sessionResult.result;
      }
      if (sql.includes("INSERT OR IGNORE INTO users")) {
        const [id, email] = values as [string, string];
        if (id && email && !users.has(email)) users.set(email, { email, id });
        return { meta: { changes: 1 } };
      }
      if (sql.includes("INSERT INTO user_personas")) {
        const [id, user_id, name, description, gender, is_default, created_at, updated_at] =
          values as [string, string, string, string | null, string | null, number, number, number];
        personas.push({
          created_at,
          description,
          gender,
          id,
          is_active: 1,
          is_default,
          name,
          updated_at,
          user_id,
        });
        return { meta: { changes: 1 } };
      }
      if (sql.includes("UPDATE user_personas SET is_default = 0 WHERE user_id = ?")) {
        const userId = values[0] as string;
        for (const p of personas) if (p.user_id === userId) p.is_default = 0;
        return { meta: { changes: 1 } };
      }
      if (sql.includes("UPDATE user_personas") && sql.includes("SET name = ?")) {
        const [name, description, gender, is_default, updated_at, id, userId] = values as [
          string,
          string | null,
          string | null,
          number,
          number,
          string,
          string,
        ];
        const p = personas.find((x) => x.id === id && x.user_id === userId);
        if (p) Object.assign(p, { description, gender, is_default, name, updated_at });
        return { meta: { changes: 1 } };
      }
      if (sql.includes("UPDATE user_personas SET is_active = 0")) {
        const [, id, userId] = values as [number, string, string];
        const p = personas.find((x) => x.id === id && x.user_id === userId);
        if (p) {
          p.is_active = 0;
          p.is_default = 0;
        }
        return { meta: { changes: 1 } };
      }
      if (sql.includes("UPDATE user_personas SET is_default = 1")) {
        const [, id] = values as [number, string];
        const p = personas.find((x) => x.id === id);
        if (p) p.is_default = 1;
        return { meta: { changes: 1 } };
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
