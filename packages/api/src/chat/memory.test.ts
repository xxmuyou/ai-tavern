import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadLatestPromptDebugSnapshot,
  processMemoryExtract,
  savePromptDebugSnapshot,
  type MemoryExtractJobPayload,
} from "./memory";
import type { PromptSegment } from "./prompt";

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildPayload(): MemoryExtractJobPayload {
  return {
    companion_id: "c-1",
    companion_name: "Maya",
    companion_reply: "<narration>She nods.</narration>I promise I'll show you the sketch.",
    created_at: new Date().toISOString(),
    relationship_narrative: "They trust each other.",
    relationship_role: "friend",
    thread_id: "t-1",
    type: "chat.memory_extract",
    user_id: "u-1",
    user_persona: { description: null, gender: null, name: "Dr. Wen" },
    user_text: "Next time show me the painting.",
  };
}

describe("chat memory extraction", () => {
  it("discards invalid structured output without writing memories", async () => {
    const inserts: unknown[][] = [];
    const env = createMemoryEnv({ inserts });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "not-json" } }],
            usage: { completion_tokens: 1, prompt_tokens: 10 },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    );

    await processMemoryExtract(env, buildPayload());

    expect(inserts.length).toBe(0);
  });

  it("upserts valid extracted memories", async () => {
    const inserts: unknown[][] = [];
    const env = createMemoryEnv({ inserts });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    resolves: [],
                    upserts: [
                      {
                        content: "Maya promised to show Dr. Wen her sketch next time.",
                        importance: 88,
                        kind: "promise",
                      },
                    ],
                  }),
                },
              },
            ],
            usage: { completion_tokens: 40, prompt_tokens: 120 },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    );

    await processMemoryExtract(env, buildPayload());

    expect(inserts.length).toBe(1);
    expect(inserts[0]).toEqual(
      expect.arrayContaining([
        "u-1",
        "c-1",
        "t-1",
        "promise",
        "Maya promised to show Dr. Wen her sketch next time.",
        88,
      ]),
    );
  });
});

describe("prompt debug snapshots", () => {
  it("stores segment metadata without prompt content and reads the latest snapshot", async () => {
    let snapshotJson = "";
    const env = {
      DB: {
        prepare(sql: string) {
          return {
            bind(...values: unknown[]) {
              return {
                async first<T>(): Promise<T | null> {
                  if (!sql.includes("FROM prompt_debug_snapshots")) return null;
                  return {
                    companion_id: "c-1",
                    created_at: 123,
                    id: "snap-1",
                    message_id: null,
                    segments_json: snapshotJson,
                    thread_id: "t-1",
                    token_estimate: 42,
                    user_id: "u-1",
                  } as T;
                },
                async run(): Promise<{ meta: { changes: number } }> {
                  snapshotJson = values[5] as string;
                  return { meta: { changes: 1 } };
                },
              };
            },
          };
        },
      },
    } as unknown as Env;

    const segments: PromptSegment[] = [
      {
        content: "Secret prompt content",
        id: "core_identity",
        included: true,
        position: "system_preamble",
        priority: 1000,
        required: true,
        role: "system",
        tokenEstimate: 12,
        trimReason: null,
      },
    ];

    await savePromptDebugSnapshot(env, {
      companionId: "c-1",
      now: 123,
      segments,
      threadId: "t-1",
      tokenEstimate: 42,
      userId: "u-1",
    });
    const snapshot = await loadLatestPromptDebugSnapshot(env, "t-1");

    expect(JSON.stringify(snapshot)).not.toContain("Secret prompt content");
    expect(snapshot?.segments).toEqual([
      {
        id: "core_identity",
        included: true,
        position: "system_preamble",
        priority: 1000,
        required: true,
        role: "system",
        token_estimate: 12,
        trim_reason: null,
      },
    ]);
  });
});

function createMemoryEnv(input: { inserts: unknown[][] }): Env {
  const llmConfig = {
    fallback_model: null,
    fallback_provider: null,
    model: "deepseek-chat",
    provider: "deepseek",
    task: "memory_extract",
  };

  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async all<T>(): Promise<{ results: T[] }> {
                return { results: [] };
              },
              async first<T>(): Promise<T | null> {
                if (sql.includes("FROM llm_config")) return llmConfig as T;
                return null;
              },
              async run(): Promise<{ meta: { changes: number } }> {
                if (sql.includes("INSERT INTO thread_memories")) {
                  input.inserts.push(values);
                }
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
    DEEPSEEK_API_KEY: "ds",
  } as unknown as Env;
}
