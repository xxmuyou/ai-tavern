import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveInvite } from "./invite-resolve";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createEnv(): Env {
  return {
    DEEPSEEK_API_KEY: "ds",
    OPENAI_API_KEY: "oai",
    DB: {
      prepare(sql: string) {
        const exec = () => ({
          async first<T>(): Promise<T | null> {
            if (sql.includes("FROM llm_config")) {
              return {
                fallback_model: null,
                fallback_provider: null,
                model: "deepseek-chat",
                provider: "deepseek",
                task: "signal",
              } as unknown as T;
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
        return { ...exec(), bind: () => exec() };
      },
    },
  } as unknown as Env;
}

function stubLlmJson(payload: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(payload) } }],
          usage: { completion_tokens: 10, prompt_tokens: 80 },
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    ),
  );
}

const args = {
  companionReply: "Sure, let's go.",
  narrative: "Close friends.",
  targetMood: "Warm, noisy",
  targetName: "The Tavern",
  userId: "u-1",
  userText: "Come to the tavern with me?",
};

describe("resolveInvite", () => {
  it("parses an acceptance", async () => {
    const env = createEnv();
    stubLlmJson({ accepted: true, reason: "She agreed happily." });
    const res = await resolveInvite(env, args);
    expect(res.ok).toBe(true);
    expect(res.accepted).toBe(true);
    expect(res.reason).toBe("She agreed happily.");
  });

  it("parses a refusal", async () => {
    const env = createEnv();
    stubLlmJson({ accepted: false, reason: "Too soon for that." });
    const res = await resolveInvite(env, args);
    expect(res.ok).toBe(true);
    expect(res.accepted).toBe(false);
  });

  it("falls back to not-accepted on invalid JSON", async () => {
    const env = createEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "not json" } }],
            usage: { completion_tokens: 3, prompt_tokens: 40 },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    );
    const res = await resolveInvite(env, args);
    expect(res.ok).toBe(false);
    expect(res.accepted).toBe(false);
  });

  it("falls back to not-accepted when the LLM call throws", async () => {
    const env = createEnv();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 502 })));
    const res = await resolveInvite(env, args);
    expect(res.ok).toBe(false);
    expect(res.accepted).toBe(false);
  });

  it("falls back when 'accepted' is missing or wrong type", async () => {
    const env = createEnv();
    stubLlmJson({ reason: "no accepted field" });
    const res = await resolveInvite(env, args);
    expect(res.ok).toBe(false);
    expect(res.accepted).toBe(false);
  });
});
