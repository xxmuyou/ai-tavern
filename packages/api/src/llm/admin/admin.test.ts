import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signSession } from "../../auth/session";
import {
  createSessionsStore,
  createUsersStore,
  type SessionsStore,
  type UsersStore,
} from "../../auth/test-fixtures";
import type { AuthEnv } from "../../auth/types";
import { LLMError, type LLMProvider, type LLMRequest, type LLMResponse, type LLMTask } from "../types";
import { handleAdminLlmRequest, type ProviderInvoker } from "./index";

const ADMIN_EMAIL = "admin@aiappsbox.com";
const PLAIN_EMAIL = "player@example.com";

// Frozen time so usage windows are deterministic.
const FROZEN_NOW_MS = Date.UTC(2026, 4, 21, 12, 0, 0); // 2026-05-21T12:00:00Z

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FROZEN_NOW_MS));
});

afterEach(() => {
  vi.useRealTimers();
});

// -----------------------------------------------------------------------------
// GET /admin/llm/config
// -----------------------------------------------------------------------------

describe("GET /admin/llm/config", () => {
  it("returns 401 when no Bearer token", async () => {
    const { env } = createEnv();
    const response = await handleAdminLlmRequest(
      new Request("http://api/admin/llm/config"),
      env,
      "/admin/llm/config",
    );
    expect(response?.status).toBe(401);
  });

  it("returns 403 when logged-in user is not admin", async () => {
    const { env } = createEnv();
    const token = await issueToken(env, PLAIN_EMAIL);
    const response = await handleAdminLlmRequest(
      authedRequest("http://api/admin/llm/config", token),
      env,
      "/admin/llm/config",
    );
    expect(response?.status).toBe(403);
  });

  it("returns tasks with updated_by resolved to email", async () => {
    const { env, configStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);
    const adminUserId = (env.usersStore.getByEmail(ADMIN_EMAIL))!.id;

    configStore.seed({
      task: "chat",
      provider: "deepseek",
      model: "deepseek-chat",
      fallback_provider: "openai",
      fallback_model: "gpt-4o-mini",
      updated_at: 1700000000000,
      updated_by: adminUserId,
    });

    const response = await handleAdminLlmRequest(
      authedRequest("http://api/admin/llm/config", token),
      env,
      "/admin/llm/config",
    );

    expect(response?.status).toBe(200);
    const body = (await response!.json()) as { tasks: AdminConfigSerialized[] };
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0]).toEqual({
      task: "chat",
      provider: "deepseek",
      model: "deepseek-chat",
      fallback_provider: "openai",
      fallback_model: "gpt-4o-mini",
      updated_at: new Date(1700000000000).toISOString(),
      updated_by: ADMIN_EMAIL,
    });
  });

  it("returns updated_by=null when the row has no updated_by", async () => {
    const { env, configStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);

    configStore.seed({
      task: "chat",
      provider: "deepseek",
      model: "deepseek-chat",
      fallback_provider: null,
      fallback_model: null,
      updated_at: 1700000000000,
      updated_by: null,
    });

    const response = await handleAdminLlmRequest(
      authedRequest("http://api/admin/llm/config", token),
      env,
      "/admin/llm/config",
    );
    const body = (await response!.json()) as { tasks: AdminConfigSerialized[] };
    expect(body.tasks[0]?.updated_by).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// PUT /admin/llm/config/:task
// -----------------------------------------------------------------------------

describe("PUT /admin/llm/config/:task", () => {
  it("updates an existing task and returns the new row", async () => {
    const { env, configStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);
    const adminUserId = env.usersStore.getByEmail(ADMIN_EMAIL)!.id;

    configStore.seed({
      task: "chat",
      provider: "deepseek",
      model: "deepseek-chat",
      fallback_provider: null,
      fallback_model: null,
      updated_at: 1,
      updated_by: null,
    });

    const response = await handleAdminLlmRequest(
      authedPutRequest("http://api/admin/llm/config/chat", token, {
        provider: "openai",
        model: "gpt-4o-mini",
        fallback_provider: "deepseek",
        fallback_model: "deepseek-chat",
      }),
      env,
      "/admin/llm/config/chat",
    );

    expect(response?.status).toBe(200);
    const body = (await response!.json()) as AdminConfigSerialized;
    expect(body.provider).toBe("openai");
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.fallback_provider).toBe("deepseek");
    expect(body.updated_by).toBe(ADMIN_EMAIL);

    const stored = configStore.get("chat")!;
    expect(stored.provider).toBe("openai");
    expect(stored.updated_at).toBe(FROZEN_NOW_MS);
    expect(stored.updated_by).toBe(adminUserId);
  });

  it("returns 404 when task does not exist", async () => {
    const { env } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);

    const response = await handleAdminLlmRequest(
      authedPutRequest("http://api/admin/llm/config/chat", token, {
        provider: "openai",
        model: "gpt-4o-mini",
      }),
      env,
      "/admin/llm/config/chat",
    );

    expect(response?.status).toBe(404);
    expect(((await response!.json()) as { error: string }).error).toBe("task_not_found");
  });

  it("returns 400 task_not_found when :task is not a known LLMTask", async () => {
    const { env } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);
    const response = await handleAdminLlmRequest(
      authedPutRequest("http://api/admin/llm/config/bogus", token, {
        provider: "openai",
        model: "gpt-4o-mini",
      }),
      env,
      "/admin/llm/config/bogus",
    );
    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("task_not_found");
  });

  it("returns 400 unknown_provider for unknown provider", async () => {
    const { env, configStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);
    configStore.seed(seedChatConfig());

    const response = await handleAdminLlmRequest(
      authedPutRequest("http://api/admin/llm/config/chat", token, {
        provider: "groq",
        model: "llama-3",
      }),
      env,
      "/admin/llm/config/chat",
    );

    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("unknown_provider");
  });

  it("returns 400 invalid_fallback when only one of provider/model is set", async () => {
    const { env, configStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);
    configStore.seed(seedChatConfig());

    const response = await handleAdminLlmRequest(
      authedPutRequest("http://api/admin/llm/config/chat", token, {
        provider: "openai",
        model: "gpt-4o-mini",
        fallback_provider: "deepseek",
        // fallback_model missing
      }),
      env,
      "/admin/llm/config/chat",
    );

    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("invalid_fallback");
  });
});

// -----------------------------------------------------------------------------
// POST /admin/llm/test
// -----------------------------------------------------------------------------

describe("POST /admin/llm/test", () => {
  it("calls the invoker with the saved config when no override", async () => {
    const { env, configStore, logsStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);
    configStore.seed(seedChatConfig());

    const invoke = vi.fn<ProviderInvoker>(async () =>
      mockResponse({ provider: "deepseek", model: "deepseek-chat" }),
    );

    const response = await handleAdminLlmRequest(
      authedPostRequest("http://api/admin/llm/test", token, {
        task: "chat",
        prompt: "Hello",
      }),
      env,
      "/admin/llm/test",
      { invoke },
    );

    expect(response?.status).toBe(200);
    const body = (await response!.json()) as TestResponseSuccess;
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("deepseek");
    expect(body.text).toBe("hello back");

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]![1].messages).toEqual([{ role: "user", content: "Hello" }]);
    expect(invoke.mock.calls[0]![2]).toEqual({ provider: "deepseek", model: "deepseek-chat" });

    // Should not have written any llm_logs row.
    expect(logsStore.all()).toHaveLength(0);
  });

  it("honours provider/model override and bypasses llm_config lookup", async () => {
    const { env, logsStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);
    // No seeded config; override path must not touch the table.

    const invoke = vi.fn<ProviderInvoker>(async () =>
      mockResponse({ provider: "openai", model: "gpt-4o-mini" }),
    );

    const response = await handleAdminLlmRequest(
      authedPostRequest("http://api/admin/llm/test", token, {
        task: "chat",
        prompt: "ping",
        provider: "openai",
        model: "gpt-4o-mini",
      }),
      env,
      "/admin/llm/test",
      { invoke },
    );

    expect(response?.status).toBe(200);
    expect(invoke.mock.calls[0]![2]).toEqual({ provider: "openai", model: "gpt-4o-mini" });
    expect(logsStore.all()).toHaveLength(0);
  });

  it("returns ok:false when invoker throws LLMError", async () => {
    const { env, configStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);
    configStore.seed(seedChatConfig());

    const invoke: ProviderInvoker = async () => {
      throw new LLMError("config_error", "DEEPSEEK_API_KEY is not configured");
    };

    let nowCalls = 0;
    const fakeNow = () => {
      nowCalls += 1;
      return FROZEN_NOW_MS + nowCalls * 100;
    };

    const response = await handleAdminLlmRequest(
      authedPostRequest("http://api/admin/llm/test", token, {
        task: "chat",
        prompt: "x",
      }),
      env,
      "/admin/llm/test",
      { invoke, now: fakeNow },
    );

    expect(response?.status).toBe(200);
    const body = (await response!.json()) as TestResponseFailure;
    expect(body.ok).toBe(false);
    expect(body.error_code).toBe("config_error");
    expect(body.error_message).toContain("DEEPSEEK_API_KEY");
    expect(body.provider).toBe("deepseek");
    expect(body.latency_ms).toBeGreaterThan(0);
  });

  it("returns 400 prompt_required when prompt is empty", async () => {
    const { env, configStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);
    configStore.seed(seedChatConfig());

    const response = await handleAdminLlmRequest(
      authedPostRequest("http://api/admin/llm/test", token, {
        task: "chat",
        prompt: "   ",
      }),
      env,
      "/admin/llm/test",
    );

    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("prompt_required");
  });

  it("returns 400 prompt_too_large for >4KB prompts", async () => {
    const { env, configStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);
    configStore.seed(seedChatConfig());

    const response = await handleAdminLlmRequest(
      authedPostRequest("http://api/admin/llm/test", token, {
        task: "chat",
        prompt: "a".repeat(4097),
      }),
      env,
      "/admin/llm/test",
    );

    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("prompt_too_large");
  });

  it("returns 400 invalid_override when only one of provider/model is set", async () => {
    const { env, configStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);
    configStore.seed(seedChatConfig());

    const response = await handleAdminLlmRequest(
      authedPostRequest("http://api/admin/llm/test", token, {
        task: "chat",
        prompt: "x",
        provider: "openai",
        // model missing
      }),
      env,
      "/admin/llm/test",
    );

    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("invalid_override");
  });
});

// -----------------------------------------------------------------------------
// GET /admin/llm/usage
// -----------------------------------------------------------------------------

describe("GET /admin/llm/usage", () => {
  it("aggregates calls into totals and by_task_provider for the default 7d window", async () => {
    const { env, logsStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);

    const recentMs = FROZEN_NOW_MS - 2 * 24 * 60 * 60 * 1000;
    const longAgoMs = FROZEN_NOW_MS - 10 * 24 * 60 * 60 * 1000;

    logsStore.seedMany([
      {
        task: "chat",
        provider: "deepseek",
        model: "deepseek-chat",
        status: "success",
        token_input: 100,
        token_output: 50,
        cost_usd: 0.01,
        created_at: recentMs,
      },
      {
        task: "chat",
        provider: "deepseek",
        model: "deepseek-chat",
        status: "error",
        token_input: null,
        token_output: null,
        cost_usd: null,
        created_at: recentMs + 1000,
      },
      {
        task: "summary",
        provider: "openai",
        model: "gpt-4o-mini",
        status: "success",
        token_input: 200,
        token_output: 80,
        cost_usd: 0.05,
        created_at: recentMs + 2000,
      },
      // Outside 7d window — should be excluded.
      {
        task: "chat",
        provider: "deepseek",
        model: "deepseek-chat",
        status: "success",
        token_input: 999,
        token_output: 999,
        cost_usd: 99,
        created_at: longAgoMs,
      },
    ]);

    const response = await handleAdminLlmRequest(
      authedRequest("http://api/admin/llm/usage", token),
      env,
      "/admin/llm/usage",
    );

    expect(response?.status).toBe(200);
    const body = (await response!.json()) as UsageResponse;
    expect(body.window).toBe("7d");
    expect(body.totals.calls).toBe(3);
    expect(body.totals.token_input).toBe(300);
    expect(body.totals.token_output).toBe(130);
    expect(body.totals.cost_usd).toBeCloseTo(0.06, 6);
    expect(body.totals.error_calls).toBe(1);

    const chat = body.by_task_provider.find((row) => row.task === "chat" && row.provider === "deepseek");
    expect(chat?.calls).toBe(2);
    expect(chat?.token_input).toBe(100);
    expect(chat?.token_output).toBe(50);
    expect(chat?.cost_usd).toBeCloseTo(0.01, 6);
    expect(chat?.error_calls).toBe(1);
  });

  it("supports window=today", async () => {
    const { env, logsStore } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);

    // Today's UTC start is 2026-05-21T00:00:00Z. Seed one row from yesterday
    // and one from today; expect only today's to count.
    const yesterday = FROZEN_NOW_MS - 24 * 60 * 60 * 1000;
    const todayRow = FROZEN_NOW_MS - 60 * 60 * 1000; // 11:00 UTC today

    logsStore.seedMany([
      {
        task: "chat",
        provider: "deepseek",
        model: "deepseek-chat",
        status: "success",
        token_input: 1,
        token_output: 1,
        cost_usd: 0.01,
        created_at: yesterday,
      },
      {
        task: "chat",
        provider: "deepseek",
        model: "deepseek-chat",
        status: "success",
        token_input: 7,
        token_output: 7,
        cost_usd: 0.07,
        created_at: todayRow,
      },
    ]);

    const response = await handleAdminLlmRequest(
      authedRequest("http://api/admin/llm/usage?window=today", token),
      env,
      "/admin/llm/usage",
    );

    const body = (await response!.json()) as UsageResponse;
    expect(body.window).toBe("today");
    expect(body.totals.calls).toBe(1);
    expect(body.totals.cost_usd).toBeCloseTo(0.07, 5);
  });

  it("returns 400 invalid_window for unknown window", async () => {
    const { env } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);

    const response = await handleAdminLlmRequest(
      authedRequest("http://api/admin/llm/usage?window=year", token),
      env,
      "/admin/llm/usage",
    );

    expect(response?.status).toBe(400);
    expect(((await response!.json()) as { error: string }).error).toBe("invalid_window");
  });

  it("returns zeros when no rows match the window", async () => {
    const { env } = createEnv();
    const token = await issueToken(env, ADMIN_EMAIL);

    const response = await handleAdminLlmRequest(
      authedRequest("http://api/admin/llm/usage", token),
      env,
      "/admin/llm/usage",
    );

    const body = (await response!.json()) as UsageResponse;
    expect(body.totals).toEqual({ calls: 0, token_input: 0, token_output: 0, cost_usd: 0, error_calls: 0 });
    expect(body.by_task_provider).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Dispatcher
// -----------------------------------------------------------------------------

describe("handleAdminLlmRequest dispatch", () => {
  it("returns null for non-admin/llm paths", async () => {
    const { env } = createEnv();
    const response = await handleAdminLlmRequest(
      new Request("http://api/admin/llm/unknown"),
      env,
      "/admin/llm/unknown",
    );
    expect(response).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

type AdminConfigSerialized = {
  task: LLMTask;
  provider: LLMProvider;
  model: string;
  fallback_provider: LLMProvider | null;
  fallback_model: string | null;
  updated_at: string;
  updated_by: string | null;
};

type TestResponseSuccess = {
  ok: true;
  text: string;
  provider: LLMProvider;
  model: string;
  tokens: { input: number; output: number };
  cost_usd: number;
  latency_ms: number;
};

type TestResponseFailure = {
  ok: false;
  provider: LLMProvider;
  model: string;
  error_code: string;
  error_message: string;
  latency_ms: number;
};

type UsageResponse = {
  window: string;
  from: string;
  to: string;
  totals: {
    calls: number;
    token_input: number;
    token_output: number;
    cost_usd: number;
    error_calls: number;
  };
  by_task_provider: Array<{
    task: LLMTask;
    provider: LLMProvider;
    calls: number;
    token_input: number;
    token_output: number;
    cost_usd: number;
    error_calls: number;
  }>;
};

function mockResponse(target: { provider: LLMProvider; model: string }): LLMResponse {
  return {
    text: "hello back",
    usage: { input_tokens: 10, output_tokens: 5 },
    provider: target.provider,
    model: target.model,
    cost_usd: 0.001,
    latency_ms: 200,
  };
}

function seedChatConfig() {
  return {
    task: "chat" as LLMTask,
    provider: "deepseek" as LLMProvider,
    model: "deepseek-chat",
    fallback_provider: null,
    fallback_model: null,
    updated_at: 1,
    updated_by: null,
  };
}

async function issueToken(env: AuthEnv, email: string): Promise<string> {
  // Insert the user record so requireAuthUser → ensureUserByEmail finds it.
  const users = (env as TestEnv).usersStore;
  let existing = users.getByEmail(email);
  if (!existing) {
    users.seed({
      id: `u-${email}`,
      email,
      email_verified: 1,
      display_name: null,
      created_at: 1,
      last_seen_at: 1,
    });
    existing = users.getByEmail(email)!;
  }
  const session = await signSession(env, { userId: existing.id, email: existing.email });
  return session.token;
}

function authedRequest(url: string, token: string): Request {
  return new Request(url, { headers: { authorization: `Bearer ${token}` } });
}

function authedPutRequest(url: string, token: string, body: unknown): Request {
  return new Request(url, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authedPostRequest(url: string, token: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// -----------------------------------------------------------------------------
// In-memory env with llm_config + llm_logs + users + sessions
// -----------------------------------------------------------------------------

type ConfigRow = {
  task: LLMTask;
  provider: LLMProvider;
  model: string;
  fallback_provider: LLMProvider | null;
  fallback_model: string | null;
  updated_at: number;
  updated_by: string | null;
};

type LogRow = {
  task: LLMTask;
  provider: LLMProvider;
  model: string;
  status: "success" | "fallback" | "error";
  token_input: number | null;
  token_output: number | null;
  cost_usd: number | null;
  created_at: number;
};

type ConfigStore = {
  seed(row: ConfigRow): void;
  get(task: string): ConfigRow | null;
  list(): ConfigRow[];
};

type LogsStore = {
  seedMany(rows: LogRow[]): void;
  all(): LogRow[];
};

type TestEnv = AuthEnv & {
  usersStore: UsersStore;
  sessionsStore: SessionsStore;
  configStore: ConfigStore;
  logsStore: LogsStore;
};

function createEnv(): {
  env: TestEnv;
  configStore: ConfigStore;
  logsStore: LogsStore;
} {
  const usersStore = createUsersStore();
  const sessionsStore = createSessionsStore();

  const configMap = new Map<string, ConfigRow>();
  const configStore: ConfigStore = {
    seed(row) {
      configMap.set(row.task, row);
    },
    get(task) {
      return configMap.get(task) ?? null;
    },
    list() {
      return [...configMap.values()];
    },
  };

  const logRows: LogRow[] = [];
  const logsStore: LogsStore = {
    seedMany(rows) {
      logRows.push(...rows);
    },
    all() {
      return [...logRows];
    },
  };

  const env = {
    APP_ENV: "dev" as const,
    AUTH_TOKEN_SECRET: "test-auth-secret",
    ADMIN_EMAILS: ADMIN_EMAIL,
    DB: {
      prepare(sql: string) {
        return buildStatement(sql, { usersStore, sessionsStore, configStore, logRows });
      },
    },
    usersStore,
    sessionsStore,
    configStore,
    logsStore,
  } as unknown as TestEnv;

  return { env, configStore, logsStore };
}

function buildStatement(
  sql: string,
  stores: {
    usersStore: UsersStore;
    sessionsStore: SessionsStore;
    configStore: ConfigStore;
    logRows: LogRow[];
  },
) {
  const exec = (values: unknown[]) => ({
    async first<T>(): Promise<T | null> {
      // llm_config (read by task)
      if (sql.includes("FROM llm_config") && sql.includes("WHERE task = ?")) {
        return (stores.configStore.get(values[0] as string) ?? null) as T | null;
      }
      // sessions (auth)
      if (sql.includes("FROM sessions") && sql.includes("WHERE jwt_jti = ?")) {
        const result = stores.sessionsStore.handle(sql, values);
        return (result?.kind === "first" ? result.result : null) as T | null;
      }
      // users
      const userResult = stores.usersStore.handle(sql, values);
      if (userResult?.kind === "first") return userResult.result as T | null;
      // llm_logs totals aggregation
      if (sql.includes("FROM llm_logs") && !sql.includes("GROUP BY")) {
        const [fromMs, toMs] = values as [number, number];
        const inRange = stores.logRows.filter(
          (row) => row.created_at >= fromMs && row.created_at < toMs,
        );
        return aggregateAll(inRange) as T;
      }
      return null;
    },
    async all<T>(): Promise<{ results: T[] }> {
      // llm_config list
      if (sql.includes("FROM llm_config") && sql.includes("ORDER BY task")) {
        return { results: stores.configStore.list() as unknown as T[] };
      }
      // users by IN (...)
      if (sql.includes("FROM users") && sql.includes("IN (")) {
        const ids = values as string[];
        const rows = ids
          .map((id) => stores.usersStore.getById(id))
          .filter((row): row is NonNullable<typeof row> => row !== null)
          .map((row) => ({ id: row.id, email: row.email }));
        return { results: rows as unknown as T[] };
      }
      // llm_logs grouped aggregation
      if (sql.includes("FROM llm_logs") && sql.includes("GROUP BY")) {
        const [fromMs, toMs] = values as [number, number];
        const inRange = stores.logRows.filter(
          (row) => row.created_at >= fromMs && row.created_at < toMs,
        );
        return { results: aggregateGrouped(inRange) as unknown as T[] };
      }
      return { results: [] };
    },
    async run() {
      // llm_config update
      if (sql.includes("UPDATE llm_config") && sql.includes("SET provider = ?")) {
        const [provider, model, fallbackProvider, fallbackModel, updatedAt, updatedBy, task] =
          values as [LLMProvider, string, LLMProvider | null, string | null, number, string, string];
        const existing = stores.configStore.get(task);
        if (!existing) {
          return { meta: { changes: 0 } };
        }
        stores.configStore.seed({
          ...existing,
          provider,
          model,
          fallback_provider: fallbackProvider,
          fallback_model: fallbackModel,
          updated_at: updatedAt,
          updated_by: updatedBy,
        });
        return { meta: { changes: 1 } };
      }
      // sessions insert/update + users insert — delegate
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

function aggregateAll(rows: LogRow[]) {
  return {
    calls: rows.length,
    token_input: sum(rows, (r) => r.token_input),
    token_output: sum(rows, (r) => r.token_output),
    cost_usd: sum(rows, (r) => r.cost_usd),
    error_calls: rows.filter((r) => r.status === "error").length,
  };
}

function aggregateGrouped(rows: LogRow[]) {
  const byKey = new Map<string, LogRow[]>();
  for (const row of rows) {
    const key = `${row.task}|${row.provider}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  const result = [...byKey.entries()].map(([key, group]) => {
    const [task, provider] = key.split("|") as [LLMTask, LLMProvider];
    return {
      task,
      provider,
      calls: group.length,
      token_input: sum(group, (r) => r.token_input),
      token_output: sum(group, (r) => r.token_output),
      cost_usd: sum(group, (r) => r.cost_usd),
      error_calls: group.filter((r) => r.status === "error").length,
    };
  });
  result.sort((a, b) => b.cost_usd - a.cost_usd);
  return result;
}

function sum<T>(rows: T[], pick: (row: T) => number | null): number {
  let total = 0;
  for (const row of rows) {
    const value = pick(row);
    if (typeof value === "number") total += value;
  }
  return total;
}
