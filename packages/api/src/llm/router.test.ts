import { afterEach, describe, expect, it, vi } from "vitest";

import { llmCall, LLMRouterError } from "./router";
import type { LLMTask } from "./types";

type LLMConfigFixture = {
  task: LLMTask;
  provider: string;
  model: string;
  fallback_provider: string | null;
  fallback_model: string | null;
};

type LLMLogEntry = {
  task: string;
  provider: string;
  model: string;
  status: string;
  error_code: string | null;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("llmCall router", () => {
  it("falls back from deepseek to openai when primary returns 429", async () => {
    const env = createEnv({
      config: [
        {
          fallback_model: "gpt-4o-mini",
          fallback_provider: "openai",
          model: "deepseek-chat",
          provider: "deepseek",
          task: "chat",
        },
      ],
    });

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("deepseek.com")) {
        return new Response("rate limit", { status: 429 });
      }
      if (target.includes("openai.com")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "fallback response" } }],
            usage: { completion_tokens: 4, prompt_tokens: 10 },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      throw new Error(`unexpected fetch to ${target}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await llmCall(env.env, {
      messages: [{ content: "Hi", role: "user" }],
      task: "chat",
    });

    expect(response.text).toBe("fallback response");
    expect(response.provider).toBe("openai");
    expect(response.model).toBe("gpt-4o-mini");

    // Three log writes: fallback (from deepseek 429), then success (from openai).
    expect(env.logs).toHaveLength(2);
    expect(env.logs[0]?.status).toBe("fallback");
    expect(env.logs[0]?.provider).toBe("deepseek");
    expect(env.logs[1]?.status).toBe("success");
    expect(env.logs[1]?.provider).toBe("openai");
  });

  it("throws final error when both providers fail and logs both attempts", async () => {
    const env = createEnv({
      config: [
        {
          fallback_model: "gpt-4o-mini",
          fallback_provider: "openai",
          model: "deepseek-chat",
          provider: "deepseek",
          task: "chat",
        },
      ],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("server error", { status: 502 })),
    );

    await expect(
      llmCall(env.env, { messages: [{ content: "x", role: "user" }], task: "chat" }),
    ).rejects.toMatchObject({ code: "server_error" });

    expect(env.logs.map((l) => l.status)).toEqual(["fallback", "error"]);
  });

  it("does not fall back on non-retryable errors (401)", async () => {
    const env = createEnv({
      config: [
        {
          fallback_model: "gpt-4o-mini",
          fallback_provider: "openai",
          model: "deepseek-chat",
          provider: "deepseek",
          task: "chat",
        },
      ],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad key", { status: 401 })),
    );

    await expect(
      llmCall(env.env, { messages: [{ content: "x", role: "user" }], task: "chat" }),
    ).rejects.toMatchObject({ code: "config_error" });

    expect(env.logs).toHaveLength(1);
    expect(env.logs[0]?.status).toBe("error");
    expect(env.logs[0]?.provider).toBe("deepseek");
  });

  it("throws when llm_config has no entry for the task", async () => {
    const env = createEnv({ config: [] });
    await expect(
      llmCall(env.env, { messages: [{ content: "x", role: "user" }], task: "chat" }),
    ).rejects.toBeInstanceOf(LLMRouterError);
  });

  it("attributes log entries to user_id when supplied", async () => {
    const env = createEnv({
      config: [
        {
          fallback_model: null,
          fallback_provider: null,
          model: "deepseek-chat",
          provider: "deepseek",
          task: "chat",
        },
      ],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
            usage: { completion_tokens: 1, prompt_tokens: 1 },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    );

    await llmCall(env.env, { messages: [{ content: "x", role: "user" }], task: "chat" }, { user_id: "u-42" });

    expect(env.logs[0]).toMatchObject({ provider: "deepseek", status: "success" });
    expect(env.logUserIds[0]).toBe("u-42");
  });
});

// -----------------------------------------------------------------------------
// In-memory mock env / DB
// -----------------------------------------------------------------------------

type CreatedEnv = {
  env: Env;
  logs: LLMLogEntry[];
  logUserIds: Array<string | null>;
};

function createEnv({ config }: { config: LLMConfigFixture[] }): CreatedEnv {
  const logs: LLMLogEntry[] = [];
  const logUserIds: Array<string | null> = [];
  const configByTask = new Map(config.map((c) => [c.task, c]));

  const env = {
    DEEPSEEK_API_KEY: "ds-test",
    OPENAI_API_KEY: "oai-test",
    DB: {
      prepare(sql: string) {
        return buildStatement(sql, configByTask, logs, logUserIds);
      },
    },
  } as unknown as Env;

  return { env, logs, logUserIds };
}

function buildStatement(
  sql: string,
  configByTask: Map<string, LLMConfigFixture>,
  logs: LLMLogEntry[],
  logUserIds: Array<string | null>,
) {
  const exec = (values: unknown[]) => ({
    async first<T>(): Promise<T | null> {
      if (sql.includes("FROM llm_config") && sql.includes("WHERE task = ?")) {
        return (configByTask.get(values[0] as string) ?? null) as T | null;
      }
      return null;
    },
    async all<T>(): Promise<{ results: T[] }> {
      return { results: [] };
    },
    async run() {
      if (sql.includes("INSERT INTO llm_logs")) {
        const [, user_id, task, provider, model, status, , , , , error_code] = values as unknown[];
        logs.push({
          error_code: error_code as string | null,
          model: model as string,
          provider: provider as string,
          status: status as string,
          task: task as string,
        });
        logUserIds.push(user_id as string | null);
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
}
