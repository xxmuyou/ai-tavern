import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserRecord } from "../identity";
import { handlePostMessage } from "./messages";

const { reserveCreditsMock, MockCreditsError } = vi.hoisted(() => {
  class MockCreditsError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number) {
      super(code);
      this.code = code;
      this.status = status;
    }
  }
  return { MockCreditsError, reserveCreditsMock: vi.fn() };
});

// Credits are covered in credits/ledger.test.ts; stub them here so chat-flow
// tests don't touch a real ledger DB. Default: reserve succeeds.
vi.mock("../credits", () => ({
  CreditsError: MockCreditsError,
  TASK_CREDIT_COST: { admin_prewarm: 0, chat_message: 1, image_generation: 40, signal_extract: 0, summary: 0, voice_generation: 3 },
  commitReservation: async () => {},
  releaseReservation: async () => {},
  reserveCredits: reserveCreditsMock,
}));

beforeEach(() => {
  reserveCreditsMock.mockReset();
  reserveCreditsMock.mockResolvedValue({ available_credits: 1000, reservation_id: "res_1", reserved_credits: 1 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type CompanionFixture = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
  example_dialogues?: string | null;
  greeting?: string | null;
};

type HistoryFixture = {
  role: "user" | "companion";
  content: string;
  scene_id?: string | null;
  created_at: number;
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
  pro?: boolean;
  quotaCount?: number;
  rateCount?: number;
  llmConfigChat?: { provider: string; model: string };
  llmConfigSignal?: { provider: string; model: string };
  thread?: { id: string; message_count: number; summary: string | null };
  history?: HistoryFixture[];
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
    kv.set(`quota:u-1:${todayUtc()}:messages`, String(opts.quotaCount));
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

  let threadId: string | null = opts.thread?.id ?? null;
  let threadMessageCount = opts.thread?.message_count ?? 0;
  const threadSummary = opts.thread?.summary ?? null;

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
                boundary: null,
                example_dialogues: opts.companion.example_dialogues ?? null,
                gender: null,
                greeting: opts.companion.greeting ?? null,
                name: "Maya",
                personality: null,
                relationship_role: null,
                secret: null,
                speech_style: null,
                voice_id: null,
                voice_speed: null,
                want: null,
              } as unknown as T;
            }
            if (sql.includes("FROM scenes")) return null;
            if (sql.includes("FROM threads")) {
              if (!threadId) return null;
              return {
                created_at: 0,
                id: threadId,
                message_count: threadMessageCount,
                persona_id: null,
                summary: threadSummary,
                updated_at: 0,
              } as unknown as T;
            }
            if (sql.includes("FROM relationships") && sql.includes("first_met_at")) {
              return { closeness: 0, distance: 0, first_met_at: Date.now(), friendship: 0, hostility: 0, romance: 0, tension: 0, trust: 0 } as unknown as T;
            }
            if (sql.includes("FROM llm_config")) {
              return (llmConfig.get(values[0] as string) ?? null) as T | null;
            }
            if (sql.includes("FROM billing_subscriptions")) {
              return opts.pro
                ? {
                  cancel_at_period_end: 0,
                  canceled_at: null,
                  created_at: Date.now(),
                  current_period_end: Date.now() + 86_400_000,
                  current_period_start: Date.now() - 1_000,
                  id: "sub_123",
                  livemode: 0,
                  price_id: "price_pro",
                  raw_json: "{}",
                  status: "active",
                  stripe_customer_id: "cus_123",
                  updated_at: Date.now(),
                  user_id: "u-1",
                } as unknown as T
                : null;
            }
            return null;
          },
          async all<T>(): Promise<{ results: T[] }> {
            if (sql.includes("SELECT role, content, scene_id, created_at FROM messages")) {
              const targetThreadId = values[0] as string;
              const limit = values[1] as number;
              const rows = (opts.history ?? [])
                .filter(() => targetThreadId === threadId)
                .slice()
                .sort((a, b) => b.created_at - a.created_at)
                .slice(0, limit)
                .map((row) => ({
                  content: row.content,
                  created_at: row.created_at,
                  role: row.role,
                  scene_id: row.scene_id ?? null,
                }));
              return { results: rows as unknown as T[] };
            }
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

function buildStreamFetch(
  chunks: string[] | string[][] = ["Hello", " there"],
  onChatBody?: (body: { messages?: Array<{ content: string; role: string }> }) => void,
): ReturnType<typeof vi.fn> {
  const attempts = (Array.isArray(chunks[0]) ? chunks : [chunks]) as string[][];
  let streamIndex = 0;
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    const requestBody =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as { messages?: Array<{ content: string; role: string }>; stream?: boolean })
        : null;
    if (target.includes("/chat/completions") && requestBody?.stream) {
      if (onChatBody) {
        onChatBody(requestBody);
      }
      const attemptChunks = attempts[Math.min(streamIndex, attempts.length - 1)] ?? [];
      streamIndex += 1;
      // Streaming chat call — encode SSE
      const sse = [
        ...attemptChunks.flatMap((content) => [
          `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`,
          "",
        ]),
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

  it("strips markdown blockquote markers from streamed and saved replies", async () => {
    pendingSignal(false);
    const { env, state } = createEnv({ companion: COMPANION });
    vi.stubGlobal("fetch", buildStreamFetch(["<narration>x</narration>\n\n ", "> 嗯。"]));

    const response = await handlePostMessage(buildPost({ text: "hi" }), env, buildCtx(), USER, "c-1");
    expect(response.status).toBe(200);

    const body = await response.text();
    expect(body).toContain(`event: chunk\ndata: {"text":"<narration>x</narration>\\n\\n"}\n\n`);
    expect(body).toContain(`event: chunk\ndata: {"text":"嗯。"}\n\n`);
    expect(body).not.toContain(`> 嗯`);
    expect(state.messages[1]?.content).toBe("<narration>x</narration>\n\n嗯。");
  });

  it("canonicalizes malformed narration tags in streamed and saved replies", async () => {
    pendingSignal(false);
    const { env, state } = createEnv({ companion: COMPANION });
    vi.stubGlobal("fetch", buildStreamFetch(["<n nar", "ration>她笑了。</x narration>", "早。<stage>ignored tag</stage>"]));

    const response = await handlePostMessage(buildPost({ text: "hi" }), env, buildCtx(), USER, "c-1");
    expect(response.status).toBe(200);

    const body = await response.text();
    expect(body).toContain(`event: chunk\ndata: {"text":"<narration>她笑了。</narration>"}\n\n`);
    expect(body).toContain(`event: chunk\ndata: {"text":"早。ignored tag"}\n\n`);
    expect(body).not.toContain("<n nar");
    expect(body).not.toContain("<x narration>");
    expect(body).not.toContain("<stage>");
    expect(state.messages[1]?.content).toBe("<narration>她笑了。</narration>早。ignored tag");
  });

  it("sanitizes malformed companion history before sending prompt context", async () => {
    pendingSignal(false);
    const chatBodies: Array<{ messages?: Array<{ content: string; role: string }> }> = [];
    const { env } = createEnv({
      companion: COMPANION,
      history: [
        { content: "hi", created_at: 1, role: "user" },
        {
          content: "<n narration>Maya nodded.</x narration>Hello.<stage>bad tag</stage>",
          created_at: 2,
          role: "companion",
        },
      ],
      thread: { id: "t-1", message_count: 2, summary: null },
    });
    vi.stubGlobal("fetch", buildStreamFetch(["Hello."], (body) => {
      chatBodies.push(body);
    }));

    const response = await handlePostMessage(buildPost({ text: "how are you?" }), env, buildCtx(), USER, "c-1");
    expect(response.status).toBe(200);
    await response.text();

    const promptText = (chatBodies[0]?.messages ?? []).map((message) => message.content).join("\n");
    expect(promptText).toContain("<narration>Maya nodded.</narration>Hello.bad tag");
    expect(promptText).not.toContain("<n narration>");
    expect(promptText).not.toContain("<x narration>");
    expect(promptText).not.toContain("<stage>");
  });

  it("does not send old seeded English greetings as prompt history when the latest user message is Chinese", async () => {
    pendingSignal(false);
    const chatBodies: Array<{ messages?: Array<{ content: string; role: string }> }> = [];
    const { env } = createEnv({
      companion: {
        ...COMPANION,
        example_dialogues: JSON.stringify(["Oh, it's you again. Sit. I'll pretend I'm not glad."]),
        greeting: "If you are here to waste my time, at least do it beautifully.",
      },
      history: [
        {
          content: "If you are here to waste my time, at least do it beautifully.",
          created_at: 1,
          role: "companion",
        },
        { content: "你好。", created_at: 2, role: "user" },
      ],
      thread: { id: "t-1", message_count: 2, summary: null },
    });
    vi.stubGlobal("fetch", buildStreamFetch(["你好。"], (body) => {
      chatBodies.push(body);
    }));

    const response = await handlePostMessage(buildPost({ text: "你今天怎么样？" }), env, buildCtx(), USER, "c-1");
    expect(response.status).toBe(200);
    await response.text();

    const promptMessages = chatBodies[0]?.messages ?? [];
    expect(promptMessages.some((message) => message.content === "If you are here to waste my time, at least do it beautifully.")).toBe(false);
    expect(promptMessages.some((message) => message.content === "你好。")).toBe(true);
    const promptText = promptMessages.map((message) => message.content).join("\n");
    expect(promptText).toContain("# Reply language contract");
    expect(promptText).toContain("same natural language and writing system");
    expect(promptText).toContain("Do not copy the language of character cards");
    expect(promptText).toContain("intentionally not quoted");
    expect(promptText).not.toContain("Oh, it's you again");
    expect(promptText).not.toContain("Simplified Chinese");
  });

  it("retries a wrong-language non-Latin reply without streaming or saving the first draft", async () => {
    pendingSignal(false);
    const chatBodies: Array<{ messages?: Array<{ content: string; role: string }> }> = [];
    const { env, state } = createEnv({
      companion: {
        ...COMPANION,
        example_dialogues: JSON.stringify(["Oh, it's you again. Sit. I'll pretend I'm not glad."]),
      },
      history: [
        { content: "你好。", created_at: 1, role: "user" },
        {
          content: "<narration>Maya looked up from her phone.</narration>Hello there.",
          created_at: 2,
          role: "companion",
        },
      ],
      thread: { id: "t-1", message_count: 2, summary: null },
    });
    vi.stubGlobal("fetch", buildStreamFetch(
      [
        ["<narration>Maya smiled at him.</narration>Hello there."],
        ["<narration>她抬头看向他。</narration>", "你好。"],
      ],
      (body) => {
        chatBodies.push(body);
      },
    ));

    const response = await handlePostMessage(buildPost({ text: "你今天怎么样？" }), env, buildCtx(), USER, "c-1");
    expect(response.status).toBe(200);
    const body = await response.text();

    expect(body).not.toContain("Hello there");
    expect(body).not.toContain("Maya smiled");
    expect(body).toContain("她抬头看向他");
    expect(body).toContain(`"warning":null`);
    expect(chatBodies).toHaveLength(2);
    expect(chatBodies[1]?.messages?.some((message) => message.content.includes("# Language correction"))).toBe(true);
    expect(reserveCreditsMock).toHaveBeenCalledTimes(1);
    expect(state.messages.length).toBe(2);
    expect(state.messages[1]?.content).toBe("<narration>她抬头看向他。</narration>你好。");
  });

  it("streams the retry with a warning when the retry still uses the wrong language", async () => {
    pendingSignal(false);
    const chatBodies: Array<{ messages?: Array<{ content: string; role: string }> }> = [];
    const { env, state } = createEnv({
      companion: COMPANION,
      history: [{ content: "你好。", created_at: 1, role: "user" }],
      thread: { id: "t-1", message_count: 1, summary: null },
    });
    vi.stubGlobal("fetch", buildStreamFetch(
      [
        ["<narration>Maya smiled at him.</narration>Hello there."],
        ["<narration>Maya paused beside him.</narration>Still English."],
      ],
      (body) => {
        chatBodies.push(body);
      },
    ));

    const response = await handlePostMessage(buildPost({ text: "你今天怎么样？" }), env, buildCtx(), USER, "c-1");
    expect(response.status).toBe(200);
    const body = await response.text();

    expect(body).not.toContain("Hello there");
    expect(body).toContain("Still English");
    expect(body).toContain("language_mismatch");
    expect(chatBodies).toHaveLength(2);
    expect(reserveCreditsMock).toHaveBeenCalledTimes(1);
    expect(state.messages[1]?.content).toBe("<narration>Maya paused beside him.</narration>Still English.");
  });

  it("forces annoyed hostile signals for direct abuse even when the model scores warm", async () => {
    pendingSignal(false);
    const { env, state } = createEnv({ companion: COMPANION });
    vi.stubGlobal("fetch", buildStreamFetch());

    const response = await handlePostMessage(buildPost({ text: "傻逼，我弄死你" }), env, buildCtx(), USER, "c-1");
    expect(response.status).toBe(200);

    const body = await response.text();
    expect(body).toMatch(/event: emotion\ndata: {"value":"annoyed"}/);
    expect(body).toContain(`"hostility":3`);
    expect(body).toContain(`"tension":2`);

    const companionMessage = state.messages.find((msg) => msg.role === "companion");
    expect(companionMessage?.emotion).toBe("annoyed");
    expect(JSON.parse(companionMessage?.signals ?? "{}")).toMatchObject({
      distance: 2,
      hostility: 3,
      tension: 2,
      trust: -2,
    });
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

  it("returns 402 when credits are insufficient", async () => {
    pendingSignal(false);
    reserveCreditsMock.mockRejectedValueOnce(new MockCreditsError("credits_insufficient", 402));
    const { env } = createEnv({ companion: COMPANION });
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

  it("does not block pro users past the soft threshold", async () => {
    pendingSignal(false);
    const { env } = createEnv({ companion: COMPANION, pro: true, quotaCount: 1000 });
    vi.stubGlobal("fetch", buildStreamFetch());
    const response = await handlePostMessage(
      buildPost({ text: "hi" }),
      env,
      buildCtx(),
      USER,
      "c-1",
    );
    expect(response.status).toBe(200);
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
