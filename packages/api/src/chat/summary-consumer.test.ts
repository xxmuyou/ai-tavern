import { beforeEach, describe, expect, it, vi } from "vitest";

import { LLMError } from "../llm";

import { handleQueueBatch } from "./summary-consumer";
import type { SummaryJobPayload } from "./summary-queue";

const llmCallMock = vi.fn();

vi.mock("../llm", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    llmCall: (...args: unknown[]) => llmCallMock(...args),
  };
});

type ThreadRow = {
  id: string;
  summary: string | null;
  summary_until_message_id: string | null;
};

type MessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: number;
};

type DbState = {
  thread: ThreadRow | null;
  messages: MessageRow[];
  updates: Array<{ summary: string; until_id: string; thread_id: string }>;
};

function createEnv(state: DbState): Env {
  return {
    DB: {
      prepare(sql: string) {
        const exec = (values: unknown[]) => ({
          async first<T>(): Promise<T | null> {
            if (sql.includes("FROM threads")) return state.thread as T | null;
            if (sql.includes("FROM messages WHERE id")) {
              const id = values[0] as string;
              const msg = state.messages.find((m) => m.id === id);
              return msg ? ({ created_at: msg.created_at } as unknown as T) : null;
            }
            return null;
          },
          async all<T>(): Promise<{ results: T[] }> {
            if (sql.includes("FROM messages")) {
              return { results: state.messages as unknown as T[] };
            }
            return { results: [] };
          },
          async run(): Promise<{ meta: { changes: number } }> {
            if (sql.startsWith("UPDATE threads")) {
              state.updates.push({
                summary: values[0] as string,
                thread_id: values[3] as string,
                until_id: values[1] as string,
              });
            }
            return { meta: { changes: 1 } };
          },
        });
        return {
          bind: (...values: unknown[]) => exec(values),
        };
      },
    },
  } as unknown as Env;
}

function summaryMsg(payload: SummaryJobPayload, ack: () => void, retry: () => void) {
  return { ack, body: payload, retry } as unknown as Message<unknown>;
}

beforeEach(() => {
  llmCallMock.mockReset();
});

describe("handleQueueBatch", () => {
  it("acks non-summary payloads without LLM call", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const env = createEnv({ messages: [], thread: null, updates: [] });
    await handleQueueBatch(
      { messages: [{ ack, body: { type: "asset.uploaded" }, retry } as unknown as Message<unknown>] } as unknown as MessageBatch<unknown>,
      env,
    );
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(llmCallMock).not.toHaveBeenCalled();
  });

  it("acks summary jobs and writes the summary back to threads", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const state: DbState = {
      messages: [
        { content: "Hi", created_at: 1, id: "m1", role: "user" },
        { content: "Hello", created_at: 2, id: "m2", role: "companion" },
      ],
      thread: { id: "t-1", summary: null, summary_until_message_id: null },
      updates: [],
    };
    llmCallMock.mockResolvedValue({
      cost_usd: 0,
      latency_ms: 10,
      model: "deepseek-chat",
      provider: "deepseek",
      text: "User greeted, companion replied warmly.",
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await handleQueueBatch(
      { messages: [summaryMsg({ created_at: "now", message_count: 60, thread_id: "t-1", type: "chat.summary" }, ack, retry)] } as unknown as MessageBatch<unknown>,
      createEnv(state),
    );

    expect(llmCallMock).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      summary: "User greeted, companion replied warmly.",
      thread_id: "t-1",
      until_id: "m2",
    });
  });

  it("acks (does not retry) when LLM throws a non-retryable config error", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const state: DbState = {
      messages: [{ content: "Hi", created_at: 1, id: "m1", role: "user" }],
      thread: { id: "t-1", summary: null, summary_until_message_id: null },
      updates: [],
    };
    llmCallMock.mockRejectedValue(new LLMError("config_error", "summary provider not wired"));

    await handleQueueBatch(
      { messages: [summaryMsg({ created_at: "now", message_count: 60, thread_id: "t-1", type: "chat.summary" }, ack, retry)] } as unknown as MessageBatch<unknown>,
      createEnv(state),
    );

    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("retries when LLM throws a retryable error", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const state: DbState = {
      messages: [{ content: "Hi", created_at: 1, id: "m1", role: "user" }],
      thread: { id: "t-1", summary: null, summary_until_message_id: null },
      updates: [],
    };
    llmCallMock.mockRejectedValue(new LLMError("server_error", "5xx from provider"));

    await handleQueueBatch(
      { messages: [summaryMsg({ created_at: "now", message_count: 60, thread_id: "t-1", type: "chat.summary" }, ack, retry)] } as unknown as MessageBatch<unknown>,
      createEnv(state),
    );

    expect(retry).toHaveBeenCalledTimes(1);
    expect(ack).not.toHaveBeenCalled();
  });

  it("skips summary work when the thread no longer exists", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const state: DbState = { messages: [], thread: null, updates: [] };

    await handleQueueBatch(
      { messages: [summaryMsg({ created_at: "now", message_count: 60, thread_id: "ghost", type: "chat.summary" }, ack, retry)] } as unknown as MessageBatch<unknown>,
      createEnv(state),
    );

    expect(llmCallMock).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });
});
