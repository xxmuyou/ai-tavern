import { describe, expect, it } from "vitest";

import { signSession } from "../auth/session";
import {
  createSessionsStore,
  createUsersStore,
  type SessionsStore,
  type UsersStore,
} from "../auth/test-fixtures";
import type { AuthEnv } from "../auth/types";
import { handleAdminSettingsRequest } from "./admin";
import { getSetting } from "./store";

const ADMIN_EMAIL = "admin@aiappsbox.com";
const PLAIN_EMAIL = "player@example.com";

type SettingRow = {
  key: string;
  value: string | null;
  updated_at: number;
  updated_by: string | null;
};

type TestEnv = AuthEnv & {
  settingsRows: Map<string, SettingRow>;
  sessionsStore: SessionsStore;
  usersStore: UsersStore;
};

describe("admin settings", () => {
  it("requires admin auth", async () => {
    const env = createEnv();
    const plainToken = await issueToken(env, PLAIN_EMAIL);

    const unauthenticated = await handleAdminSettingsRequest(
      new Request("http://api/admin/settings"),
      env,
      "/admin/settings",
    );
    expect(unauthenticated?.status).toBe(401);

    const forbidden = await handleAdminSettingsRequest(
      authedRequest("http://api/admin/settings", plainToken),
      env,
      "/admin/settings",
    );
    expect(forbidden?.status).toBe(403);
  });

  it("lists metadata while hiding secret values", async () => {
    const env = createEnv({
      DEEPSEEK_API_KEY: "env-secret",
    });
    env.settingsRows.set("image_gen.workflows", {
      key: "image_gen.workflows",
      updated_at: 123,
      updated_by: "admin-1",
      value: "{\"portrait_create\":{\"mode\":\"create\",\"workflowId\":\"workflow\",\"promptNodeId\":\"6\"}}",
    });
    const token = await issueToken(env, ADMIN_EMAIL);

    const response = await handleAdminSettingsRequest(
      authedRequest("http://api/admin/settings", token),
      env,
      "/admin/settings",
    );

    expect(response?.status).toBe(200);
    const body = (await response!.json()) as { settings: Array<Record<string, unknown>> };
    const secret = body.settings.find((row) => row.key === "llm.deepseek_api_key")!;
    expect(secret).toMatchObject({
      admin_mode: "status_only",
      env_key: "DEEPSEEK_API_KEY",
      is_set: true,
      source: "env",
      type: "secret",
    });
    expect(secret).not.toHaveProperty("value");

    const workflows = body.settings.find((row) => row.key === "image_gen.workflows")!;
    expect(workflows).toMatchObject({
      env_key: null,
      source: "db",
      value: "{\"portrait_create\":{\"mode\":\"create\",\"workflowId\":\"workflow\",\"promptNodeId\":\"6\"}}",
    });
  });

  it("requires confirmation for high-risk settings", async () => {
    const env = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);

    const response = await handleAdminSettingsRequest(
      authedPut("http://api/admin/settings/auth/admin_emails", token, {
        value: "owner@example.com",
      }),
      env,
      "/admin/settings/auth.admin_emails",
    );

    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("confirmation_required");
  });

  it("saves and resets a setting override", async () => {
    const env = createEnv({ RATE_LIMIT_PER_MINUTE: "120" });
    const token = await issueToken(env, ADMIN_EMAIL);

    const saved = await handleAdminSettingsRequest(
      authedPut("http://api/admin/settings/limits.rate_limit_per_minute", token, {
        value: "42",
      }),
      env,
      "/admin/settings/limits.rate_limit_per_minute",
    );
    expect(saved?.status).toBe(200);
    const savedBody = (await saved!.json()) as { setting: Record<string, unknown>; source: string };
    expect(savedBody.source).toBe("db");
    expect(savedBody.setting).toMatchObject({
      key: "limits.rate_limit_per_minute",
      source: "db",
      updated_by: ADMIN_EMAIL,
      value: "42",
    });
    expect(env.settingsRows.get("limits.rate_limit_per_minute")?.value).toBe("42");

    const reset = await handleAdminSettingsRequest(
      authedPut("http://api/admin/settings/limits.rate_limit_per_minute", token, {
        value: "",
      }),
      env,
      "/admin/settings/limits.rate_limit_per_minute",
    );
    expect(reset?.status).toBe(200);
    const resetBody = (await reset!.json()) as { setting: Record<string, unknown>; source: string };
    expect(resetBody.source).toBe("env");
    expect(resetBody.setting).toMatchObject({
      key: "limits.rate_limit_per_minute",
      source: "env",
      updated_by: null,
      value: "120",
    });
    expect(env.settingsRows.has("limits.rate_limit_per_minute")).toBe(false);
  });

  it("validates json settings", async () => {
    const env = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);

    const response = await handleAdminSettingsRequest(
      authedPut("http://api/admin/settings/image_gen.workflows", token, {
        value: "{",
      }),
      env,
      "/admin/settings/image_gen.workflows",
    );

    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("invalid_json");
  });

  it("does not reveal env-managed secrets", async () => {
    const env = createEnv({ OPENAI_API_KEY: "env-openai-key" });
    const token = await issueToken(env, ADMIN_EMAIL);

    const response = await handleAdminSettingsRequest(
      authedRequest("http://api/admin/settings/llm.openai_api_key/reveal", token),
      env,
      "/admin/settings/llm.openai_api_key/reveal",
    );

    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("env_managed_setting");
  });

  it("does not allow env-managed secrets to be saved from admin", async () => {
    const env = createEnv({ OPENAI_API_KEY: "env-openai-key" });
    const token = await issueToken(env, ADMIN_EMAIL);

    const response = await handleAdminSettingsRequest(
      authedPut("http://api/admin/settings/llm.openai_api_key", token, {
        value: "db-openai-key",
      }),
      env,
      "/admin/settings/llm.openai_api_key",
    );

    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("env_managed_setting");
    expect(env.settingsRows.has("llm.openai_api_key")).toBe(false);
  });

  it("ignores old db overrides for env-managed secrets", async () => {
    const env = createEnv({ OPENAI_API_KEY: "env-openai-key" });
    env.settingsRows.set("llm.openai_api_key", {
      key: "llm.openai_api_key",
      updated_at: 123,
      updated_by: "admin-1",
      value: "db-openai-key",
    });
    const token = await issueToken(env, ADMIN_EMAIL);

    expect(await getSetting(env, "llm.openai_api_key")).toBe("env-openai-key");

    const response = await handleAdminSettingsRequest(
      authedRequest("http://api/admin/settings", token),
      env,
      "/admin/settings",
    );
    const body = (await response!.json()) as { settings: Array<Record<string, unknown>> };
    const secret = body.settings.find((row) => row.key === "llm.openai_api_key")!;
    expect(secret).toMatchObject({
      admin_mode: "status_only",
      is_set: true,
      source: "env",
      updated_at: null,
      updated_by: null,
    });
    expect(secret).not.toHaveProperty("value");
  });

  it("does not reveal non-secret settings", async () => {
    const env = createEnv({ RATE_LIMIT_PER_MINUTE: "120" });
    const token = await issueToken(env, ADMIN_EMAIL);

    const response = await handleAdminSettingsRequest(
      authedRequest("http://api/admin/settings/limits.rate_limit_per_minute/reveal", token),
      env,
      "/admin/settings/limits.rate_limit_per_minute/reveal",
    );

    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("not_secret");
  });
});

function createEnv(overrides: Record<string, unknown> = {}): TestEnv {
  const usersStore = createUsersStore();
  const sessionsStore = createSessionsStore();
  const settingsRows = new Map<string, SettingRow>();

  const env = {
    APP_ENV: "dev" as const,
    AUTH_TOKEN_SECRET: "test-auth-secret",
    ADMIN_EMAILS: ADMIN_EMAIL,
    DB: {
      prepare(sql: string) {
        return buildStatement(sql, { sessionsStore, settingsRows, usersStore });
      },
    },
    settingsRows,
    sessionsStore,
    usersStore,
    ...overrides,
  } as unknown as TestEnv;

  return env;
}

function buildStatement(
  sql: string,
  stores: {
    sessionsStore: SessionsStore;
    settingsRows: Map<string, SettingRow>;
    usersStore: UsersStore;
  },
) {
  const exec = (values: unknown[]) => ({
    async first<T>(): Promise<T | null> {
      if (sql.includes("FROM sessions") && sql.includes("WHERE jwt_jti = ?")) {
        const result = stores.sessionsStore.handle(sql, values);
        return (result?.kind === "first" ? result.result : null) as T | null;
      }
      if (sql.includes("FROM admin_user_allowlist")) {
        return null;
      }
      const userResult = stores.usersStore.handle(sql, values);
      if (userResult?.kind === "first") return userResult.result as T | null;
      return null;
    },
    async all<T>(): Promise<{ results: T[] }> {
      if (sql.includes("FROM app_settings")) {
        return { results: [...stores.settingsRows.values()] as unknown as T[] };
      }
      if (sql.includes("FROM users") && sql.includes("IN (")) {
        const ids = values as string[];
        return {
          results: ids
            .map((id) => stores.usersStore.getById(id))
            .filter((row): row is NonNullable<typeof row> => row !== null)
            .map((row) => ({ id: row.id, email: row.email })) as unknown as T[],
        };
      }
      return { results: [] };
    },
    async run() {
      if (sql.startsWith("DELETE FROM app_settings")) {
        stores.settingsRows.delete(values[0] as string);
        return { meta: { changes: 1 } };
      }
      if (sql.startsWith("INSERT INTO app_settings")) {
        const [key, value, updatedAt, updatedBy] = values as [string, string, number, string];
        stores.settingsRows.set(key, {
          key,
          updated_at: updatedAt,
          updated_by: updatedBy,
          value,
        });
        return { meta: { changes: 1 } };
      }
      const sessionResult = stores.sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "run") return sessionResult.result;
      const userResult = stores.usersStore.handle(sql, values);
      if (userResult?.kind === "run") return userResult.result;
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

async function issueToken(env: TestEnv, email: string): Promise<string> {
  let existing = env.usersStore.getByEmail(email);
  if (!existing) {
    env.usersStore.seed({
      created_at: 1,
      display_name: null,
      email,
      email_verified: 1,
      id: email === ADMIN_EMAIL ? "admin-1" : "user-1",
      last_seen_at: 1,
    });
    existing = env.usersStore.getByEmail(email)!;
  }
  const session = await signSession(env, { email: existing.email, userId: existing.id });
  return session.token;
}

function authedRequest(url: string, token: string): Request {
  return new Request(url, { headers: { authorization: `Bearer ${token}` } });
}

function authedPut(url: string, token: string, body: unknown): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    method: "PUT",
  });
}
