import { afterEach, describe, expect, it, vi } from "vitest";

import { LLMError } from "../types";
import { openAICall, openAIStream } from "./openai-shared";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openAICall (non-streaming)", () => {
  it("posts to the right URL with the right headers and body", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hello back" } }],
          usage: { completion_tokens: 5, prompt_tokens: 12 },
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await openAICall(
      { apiKey: "test-key", baseURL: "https://api.example.com/v1", model: "gpt-4o-mini", provider: "openai" },
      { messages: [{ content: "Hi", role: "user" }], task: "chat" },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const [url, init] = calls[0]!;
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    const initRecord = init as RequestInit & { headers: Record<string, string>; body: string };
    expect(initRecord.method).toBe("POST");
    expect(initRecord.headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(initRecord.body) as Record<string, unknown>;
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([{ content: "Hi", role: "user" }]);

    expect(response.text).toBe("Hello back");
    expect(response.usage).toEqual({ input_tokens: 12, output_tokens: 5 });
    expect(response.provider).toBe("openai");
    expect(response.model).toBe("gpt-4o-mini");
    expect(response.cost_usd).toBeGreaterThan(0);
  });

  it("disables thinking for minimax but not for other providers", async () => {
    const makeResponse = () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          usage: { completion_tokens: 1, prompt_tokens: 1 },
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );

    const minimaxFetch = vi.fn(async () => makeResponse());
    vi.stubGlobal("fetch", minimaxFetch);
    await openAICall(
      { apiKey: "k", baseURL: "https://api.minimaxi.com/v1", model: "MiniMax-M3", provider: "minimax" },
      { messages: [{ content: "hi", role: "user" }], task: "chat" },
    );
    const minimaxBody = JSON.parse(
      (minimaxFetch.mock.calls as unknown as Array<[string, RequestInit & { body: string }]>)[0]![1].body,
    ) as { thinking?: unknown };
    expect(minimaxBody.thinking).toEqual({ type: "disabled" });

    const openaiFetch = vi.fn(async () => makeResponse());
    vi.stubGlobal("fetch", openaiFetch);
    await openAICall(
      { apiKey: "k", model: "gpt-4o-mini", provider: "openai" },
      { messages: [{ content: "hi", role: "user" }], task: "chat" },
    );
    const openaiBody = JSON.parse(
      (openaiFetch.mock.calls as unknown as Array<[string, RequestInit & { body: string }]>)[0]![1].body,
    ) as { thinking?: unknown };
    expect(openaiBody.thinking).toBeUndefined();
  });

  it("parses structured JSON when json_schema is set", async () => {
    const responsePayload = JSON.stringify({ closeness: 1, romance: 0 });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: responsePayload } }],
          usage: { completion_tokens: 4, prompt_tokens: 10 },
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await openAICall(
      { apiKey: "k", model: "gpt-4o-mini", provider: "openai" },
      {
        json_schema: { properties: { closeness: { type: "number" } }, type: "object" },
        messages: [{ content: "Score this", role: "user" }],
        task: "signal",
      },
    );

    expect(response.structured).toEqual({ closeness: 1, romance: 0 });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit & { body: string }]>;
    const init = calls[0]![1];
    const body = JSON.parse(init.body) as { response_format?: { type: string } };
    expect(body.response_format?.type).toBe("json_schema");
  });

  it("uses json_object response_format for non-openai providers", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "{}" } }],
          usage: { completion_tokens: 1, prompt_tokens: 1 },
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await openAICall(
      { apiKey: "k", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat", provider: "deepseek" },
      {
        json_schema: { type: "object" },
        messages: [{ content: "x", role: "user" }],
        task: "signal",
      },
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit & { body: string }]>;
    const init = calls[0]![1];
    const body = JSON.parse(init.body) as { response_format?: { type: string } };
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("maps 429 to retryable rate_limit error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Too many requests", { status: 429 })),
    );

    await expect(
      openAICall(
        { apiKey: "k", model: "gpt-4o-mini", provider: "openai" },
        { messages: [{ content: "x", role: "user" }], task: "chat" },
      ),
    ).rejects.toMatchObject({
      code: "rate_limit",
      retryable: true,
    });
  });

  it("maps 401 to non-retryable config_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid api key", { status: 401 })),
    );

    await expect(
      openAICall(
        { apiKey: "k", model: "gpt-4o-mini", provider: "openai" },
        { messages: [{ content: "x", role: "user" }], task: "chat" },
      ),
    ).rejects.toMatchObject({
      code: "config_error",
      retryable: false,
    });
  });

  it("rejects when api key is missing", async () => {
    await expect(
      openAICall(
        { apiKey: "", model: "gpt-4o-mini", provider: "openai" },
        { messages: [{ content: "x", role: "user" }], task: "chat" },
      ),
    ).rejects.toBeInstanceOf(LLMError);
  });

  it("strips a reasoning <think> block from the reply", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "<think>I should stay in character.</think>\n\nYou came back." } },
          ],
          usage: { completion_tokens: 5, prompt_tokens: 12 },
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await openAICall(
      { apiKey: "k", baseURL: "https://api.minimaxi.com/v1", model: "MiniMax-M3", provider: "minimax" },
      { messages: [{ content: "hi", role: "user" }], task: "chat" },
    );

    expect(response.text).toBe("You came back.");
  });
});

describe("openAIStream", () => {
  it("yields text chunks then a final done with usage", async () => {
    const sse = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}`,
      "",
      `data: ${JSON.stringify({ choices: [{ delta: { content: " there" } }] })}`,
      "",
      `data: ${JSON.stringify({ choices: [{ finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2 } })}`,
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { status: 200 })),
    );

    const chunks: Array<{ type: string; text?: string; usage?: unknown }> = [];
    for await (const chunk of openAIStream(
      { apiKey: "k", model: "gpt-4o-mini", provider: "openai" },
      { messages: [{ content: "hi", role: "user" }], task: "chat" },
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { text: "Hello", type: "text" },
      { text: " there", type: "text" },
      { type: "done", usage: { input_tokens: 5, output_tokens: 2 }, structured: undefined },
    ]);
  });

  it("strips a <think> block split across streamed chunks", async () => {
    // The open/close tags are deliberately split mid-tag across deltas to
    // exercise the cross-chunk state machine.
    const deltas = ["<thi", "nk>secret rea", "soning</thi", "nk>\n\nHel", "lo there"];
    const sse =
      deltas
        .map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n`)
        .join("\n") +
      `\ndata: ${JSON.stringify({ choices: [{ finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`;

    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { status: 200 })),
    );

    const texts: string[] = [];
    for await (const chunk of openAIStream(
      { apiKey: "k", baseURL: "https://api.minimaxi.com/v1", model: "MiniMax-M3", provider: "minimax" },
      { messages: [{ content: "hi", role: "user" }], task: "chat" },
    )) {
      if (chunk.type === "text" && chunk.text) texts.push(chunk.text);
    }

    expect(texts.join("")).toBe("Hello there");
  });
});
