import { afterEach, describe, expect, it, vi } from "vitest";

import { extractSignals } from "./signal-extract";

afterEach(() => {
  vi.unstubAllGlobals();
});

type LLMConfigFixture = {
  task: string;
  provider: string;
  model: string;
  fallback_provider: string | null;
  fallback_model: string | null;
};

function createEnv(config: LLMConfigFixture[]): Env {
  const byTask = new Map(config.map((c) => [c.task, c]));
  return {
    DEEPSEEK_API_KEY: "ds",
    OPENAI_API_KEY: "oai",
    DB: {
      prepare(sql: string) {
        const exec = (values: unknown[]) => ({
          async first<T>(): Promise<T | null> {
            if (sql.includes("FROM llm_config")) {
              return (byTask.get(values[0] as string) ?? null) as T | null;
            }
            return null;
          },
          async all<T>(): Promise<{ results: T[] }> {
            return { results: [] };
          },
          async run() {
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
}

const defaultConfig: LLMConfigFixture[] = [
  {
    fallback_model: null,
    fallback_provider: null,
    model: "deepseek-chat",
    provider: "deepseek",
    task: "signal",
  },
];

describe("extractSignals", () => {
  it("parses well-formed structured output", async () => {
    const env = createEnv(defaultConfig);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    emotion: "warm",
                    signals: {
                      closeness: 2,
                      distance: 0,
                      friendship: 1,
                      hostility: 0,
                      romance: 1,
                      tension: 0,
                      trust: 1,
                    },
                  }),
                },
              },
            ],
            usage: { completion_tokens: 30, prompt_tokens: 200 },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    );

    const result = await extractSignals(env, {
      companionReply: "Sure, let's grab one.",
      narrative: "Friend.",
      userId: "u-1",
      userText: "Want coffee?",
    });

    expect(result.ok).toBe(true);
    expect(result.emotion).toBe("warm");
    expect(result.signals.closeness).toBe(2);
    expect(result.signals.romance).toBe(1);
    expect(result.signals.hostility).toBe(0);
  });

  it("clamps out-of-range values to ±3", async () => {
    const env = createEnv(defaultConfig);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    emotion: "playful",
                    signals: {
                      closeness: 99,
                      distance: 0,
                      friendship: 0,
                      hostility: -50,
                      romance: 0,
                      tension: 0,
                      trust: 0,
                    },
                  }),
                },
              },
            ],
            usage: { completion_tokens: 30, prompt_tokens: 200 },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    );

    const result = await extractSignals(env, {
      companionReply: "x",
      narrative: "x",
      userId: "u-1",
      userText: "x",
    });

    expect(result.signals.closeness).toBe(3);
    expect(result.signals.hostility).toBe(-3);
  });

  it("falls back to zeros + neutral on invalid JSON", async () => {
    const env = createEnv(defaultConfig);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "not json at all" } }],
            usage: { completion_tokens: 5, prompt_tokens: 100 },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    );

    const result = await extractSignals(env, {
      companionReply: "x",
      narrative: "x",
      userId: "u-1",
      userText: "x",
    });

    expect(result.ok).toBe(false);
    expect(result.emotion).toBe("neutral");
    expect(result.signals.closeness).toBe(0);
  });

  it("falls back gracefully when LLM throws", async () => {
    const env = createEnv(defaultConfig);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("server error", { status: 502 })),
    );

    const result = await extractSignals(env, {
      companionReply: "x",
      narrative: "x",
      userId: "u-1",
      userText: "x",
    });

    expect(result.ok).toBe(false);
    expect(result.emotion).toBe("neutral");
  });

  it("normalises unknown emotion to neutral", async () => {
    const env = createEnv(defaultConfig);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    emotion: "ecstatic",
                    signals: {
                      closeness: 1,
                      distance: 0,
                      friendship: 0,
                      hostility: 0,
                      romance: 0,
                      tension: 0,
                      trust: 0,
                    },
                  }),
                },
              },
            ],
            usage: { completion_tokens: 30, prompt_tokens: 100 },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    );

    const result = await extractSignals(env, {
      companionReply: "x",
      narrative: "x",
      userId: "u-1",
      userText: "x",
    });

    expect(result.emotion).toBe("neutral");
  });
});
