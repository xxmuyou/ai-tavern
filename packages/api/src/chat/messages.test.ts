import { afterEach, describe, expect, it, vi } from "vitest";

import type { UserRecord } from "../identity";
import { handlePostMessage } from "./messages";

afterEach(() => {
  vi.unstubAllGlobals();
});

type CompanionFixture = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
};

type Inserts = {
  messages: Array<{
    id: string;
    thread_id: string;
    role: string;
    content: string;
    signals: string | null;
    emotion: string | null;
  }>;
  threadBumps: number;
  relationshipApplies: number;
  signalUpdates: number;
  quotaIncrements: number;
};

function createEnv(opts: {
  companion: CompanionFixture | null;
  quotaCount?: number;
  rateCount?: number;
  llmConfigChat?: { provider: string; model: string };
  llmConfigSignal?: { provider: string; model: string };
}): { env: Env; state: Inserts } {
  const state: Inserts = {
    messages: [],
    quotaIncrements: 0,
    relationshipApplies: 0,
    signalUpdates: 0,
    threadBumps: 0,
  };

  const kv = new Map<string, string>();
  if (opts.quotaCount !== undefined) {
    kv.set(`quota:u-1:${todayUtc()}`, String(opts.quotaCount));
  }
  if (opts.rateCount !== undefined) {
    const minute = nowMinuteUtc();
    kv.set(`ratelimit:u-1:${minute}`, String(opts.rateCount));
  }

  const llmConfig = new Map<string, unknown>([
    [
      "chat",
      {
        fallback_model: null,
        fallback_provider: null,
        model: opts.llmConfigChat?.model ?? "deepseek-chat",
        provider: opts.llmConfigChat?.provider ?? "deepseek",
        task: "chat",
      },
    ],
    [
      "signal",
      {
        fallback_model: null,
        fallback_provider: null,
        model: opts.llmConfigSignal?.model ?? "deepseek-chat",
        provider: opts.llmConfigSignal?.provider ?? "deepseek",
        task: "signal",
      },
    ],
  ]);

  let threadId: string | null = null;
  let threadMessageCount = 0;

  const env = {
    CONFIG: {
      async get(key: string): Promise<string | null> {
        return kv.get(key) ?? null;
      },
      async put(key: string, value: string): Promise<void> {
        kv.set(key, value);
      },
    },
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
                name: "Maya",
                personality: null,
                relationship_role: null,
                speech_style: null,
              } as unknown as T;
            }
            if (sql.includes("FROM scenes")) return null;
            if (sql.includes("FROM threads")) {
              if (!threadId) return null;
              return {
                created_at: 0,
                id: threadId,
                message_count: threadMessageCount,
                summary: null,
                updated_at: 0,
              } as unknown as T;
            }
            if (sql.includes("FROM relationships") && sql.includes("first_met_at")) {
              return { closeness: 0, distance: 0, first_met_at: Date.now(), friendship: 0, hostility: 0, romance: 0, tension: 0, trust: 0 } as unknown as T;
            }
            if (sql.includes("FROM llm_config")) {
              return (llmConfig.get(values[0] as string) ?? null) as T | null;
            }
            if (sql.includes("FROM subscriptions")) {
              return null;
            }
            return null;
          },
          async all<T>(): Promise<{ results: T[] }> {
            return { results: [] };
          },
          async run(): Promise<{ meta: { changes: number } }> {
            if (sql.includes("INSERT INTO threads")) {
              threadId = values[0] as string;
              threadMessageCount = 0;
            }
            if (sql.includes("INSERT INTO messages")) {
              state.messages.push({
                content: values[2] as string,
                emotion: null,
                id: values[0] as string,
                role: sql.includes("'companion'") ? "companion" : "user",
                signals: null,
                thread_id: values[1] as string,
              });
            }
            if (sql.includes("UPDATE threads") && sql.includes("message_count = message_count + 2")) {
              state.threadBumps += 1;
              threadMessageCount += 2;
            }
            if (sql.includes("UPDATE messages") && sql.includes("signals")) {
              state.signalUpdates += 1;
              const id = values[2] as string;
              const msg = state.messages.find((m) => m.id === id);
              if (msg) {
                msg.signals = values[0] as string;
                msg.emotion = values[1] as string;
              }
            }
            if (sql.includes("UPDATE relationships")) {
              state.relationshipApplies += 1;
            }
            if (sql.includes("INSERT OR IGNORE INTO relationships")) {
              // ensureRelationship
            }
            if (sql.includes("INSERT INTO llm_logs")) {
              // swallow
            }
            if (sql.includes("INSERT INTO usage_log")) {
              // swallow
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
    DEEPSEEK_API_KEY: "ds",
    JOB_QUEUE: { async send() {} },
    OPENAI_API_KEY: "oai",
  } as unknown as Env;

  return { env, state };
}

function todayUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function nowMinuteUtc(): string {
  const d = new Date();
  return `${todayUtc()}T${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function buildStreamFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes("/chat/completions") && !pendingSignal()) {
      // Streaming chat call — encode SSE
      const sse = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}`,
        "",
        `data: ${JSON.stringify({ choices: [{ delta: { content: " there" } }] })}`,
        "",
        `data: ${JSON.stringify({
          choices: [{ finish_reason: "stop" }],
          usage: { completion_tokens: 2, prompt_tokens: 100 },
        })}`,
        "",
        "data: [DONE]",
        "",
        "",
      ].join("\n");
      const stream = new ReadableStream({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        },
      });
      pendingSignal(true);
      return new Response(stream, { status: 200 });
    }
    // Second call (signal) — non-streaming JSON
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                emotion: "warm",
                signals: {
                  closeness: 1,
                  distance: 0,
                  friendship: 1,
                  hostility: 0,
                  romance: 0,
                  tension: 0,
                  trust: 1,
                },
              }),
            },
          },
        ],
        usage: { completion_tokens: 25, prompt_tokens: 150 },
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  });
}

let _pendingSignal = false;
function pendingSignal(set?: boolean): boolean {
  if (set !== undefined) _pendingSignal = set;
  return _pendingSignal;
}

const USER: UserRecord = { email: "u@x.com", id: "u-1" };

const COMPANION: CompanionFixture = {
  created_by: null,
  id: "c-1",
  is_active: 1,
  source: "official",
};

function buildCtx(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) {
      void promise;
    },
    passThroughOnException() {},
  } as unknown as ExecutionContext;
}

function buildPost(body: unknown): Request {
  return new Request("https://x/chat/c-1/messages", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("handlePostMessage", () => {
  it("streams chunks, then signals, emotion, done", async () => {
    pendingSignal(false);
    const { env, state } = createEnv({ companion: COMPANION });
    vi.stubGlobal("fetch", buildStreamFetch());

    const response = await handlePostMessage(buildPost({ text: "hi" }), env, buildCtx(), USER, "c-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");

    const body = await response.text();
    expect(body).toContain(`event: chunk\ndata: {"text":"Hello"}\n\n`);
    expect(body).toContain(`event: chunk\ndata: {"text":" there"}\n\n`);
    expect(body).toContain(`event: signals`);
    expect(body).toMatch(/event: emotion\ndata: {"value":"warm"}/);
    expect(body).toContain(`event: done`);

    expect(state.messages.length).toBe(2);
    expect(state.messages[0]?.role).toBe("user");
    expect(state.messages[1]?.role).toBe("companion");
    expect(state.messages[1]?.content).toBe("Hello there");
    expect(state.threadBumps).toBe(1);
    expect(state.signalUpdates).toBe(1);
    expect(state.relationshipApplies).toBeGreaterThanOrEqual(1);
  });

  it("returns 400 when text is missing", async () => {
    pendingSignal(false);
    const { env } = createEnv({ companion: COMPANION });
    vi.stubGlobal("fetch", buildStreamFetch());
    const response = await handlePostMessage(buildPost({}), env, buildCtx(), USER, "c-1");
    expect(response.status).toBe(400);
  });

  it("returns 404 when companion not found", async () => {
    pendingSignal(false);
    const { env } = createEnv({ companion: null });
    vi.stubGlobal("fetch", buildStreamFetch());
    const response = await handlePostMessage(
      buildPost({ text: "hi" }),
      env,
      buildCtx(),
      USER,
      "missing",
    );
    expect(response.status).toBe(404);
  });

  it("returns 403 when user companion not owned", async () => {
    pendingSignal(false);
    const { env } = createEnv({
      companion: { created_by: "someone-else", id: "c-1", is_active: 1, source: "user" },
    });
    vi.stubGlobal("fetch", buildStreamFetch());
    const response = await handlePostMessage(
      buildPost({ text: "hi" }),
      env,
      buildCtx(),
      USER,
      "c-1",
    );
    expect(response.status).toBe(403);
  });

  it("returns 429 when rate limit exhausted", async () => {
    pendingSignal(false);
    const { env } = createEnv({ companion: COMPANION, rateCount: 10 });
    vi.stubGlobal("fetch", buildStreamFetch());
    const response = await handlePostMessage(
      buildPost({ text: "hi" }),
      env,
      buildCtx(),
      USER,
      "c-1",
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("returns 402 when daily quota exceeded", async () => {
    pendingSignal(false);
    const { env } = createEnv({ companion: COMPANION, quotaCount: 30 });
    vi.stubGlobal("fetch", buildStreamFetch());
    const response = await handlePostMessage(
      buildPost({ text: "hi" }),
      env,
      buildCtx(),
      USER,
      "c-1",
    );
    expect(response.status).toBe(402);
  });

  it("returns 503 when call 1 fails before any chunks", async () => {
    pendingSignal(false);
    const { env, state } = createEnv({ companion: COMPANION });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("server error", { status: 502 })));
    const response = await handlePostMessage(
      buildPost({ text: "hi" }),
      env,
      buildCtx(),
      USER,
      "c-1",
    );
    expect(response.status).toBe(503);
    expect(state.messages.length).toBe(0);
    expect(state.threadBumps).toBe(0);
  });
});
