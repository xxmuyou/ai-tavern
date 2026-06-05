import { afterEach, describe, expect, it, vi } from "vitest";

import { getImageGenProvider } from ".";
import { openAiImageGenProvider } from "./openai-provider";

describe("getImageGenProvider per-workflow routing", () => {
  it("routes portrait create and variation to independently configured providers", async () => {
    const env = {
      IMAGE_GEN_PORTRAIT_CREATE_PROVIDER: "openai",
      IMAGE_GEN_PORTRAIT_VARIATION_PROVIDER: "runninghub",
    } as unknown as Env;

    expect((await getImageGenProvider(env, "create")).name).toBe("openai");
    expect((await getImageGenProvider(env, "variation")).name).toBe("runninghub");
  });

  it("routes chat moment by workflow key instead of create mode", async () => {
    const env = {
      IMAGE_GEN_PORTRAIT_CREATE_PROVIDER: "openai",
      IMAGE_GEN_CHAT_MOMENT_PROVIDER: "runninghub",
    } as unknown as Env;

    expect((await getImageGenProvider(env, "create")).name).toBe("openai");
    expect((await getImageGenProvider(env, "create", "chat_moment")).name).toBe("runninghub");
  });

  it("falls back to the default provider when a workflow has none", async () => {
    const env = { IMAGE_GEN_PROVIDER: "openai" } as unknown as Env;
    expect((await getImageGenProvider(env, "create")).name).toBe("openai");
    expect((await getImageGenProvider(env, "variation")).name).toBe("openai");
  });

  it("defaults to mock with no config", async () => {
    const env = {} as unknown as Env;
    expect((await getImageGenProvider(env, "create")).name).toBe("mock");
  });
});

describe("openAiImageGenProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("create calls the generations endpoint and returns completed bytes", async () => {
    const b64 = btoa("png-bytes");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      IMAGE_GEN_PORTRAIT_CREATE_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_IMAGE_MODEL: "gpt-image-1",
    } as unknown as Env;

    const result = await openAiImageGenProvider.generate(
      { mode: "create", prompt: "a calm portrait" },
      env,
    );

    expect(result).toMatchObject({
      content_type: "image/png",
      model: "gpt-image-1",
      provider: "openai",
      type: "completed",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "gpt-image-1", prompt: "a calm portrait" });
  });

  it("fails as non-retryable when the api key is missing", async () => {
    const env = { IMAGE_GEN_PORTRAIT_CREATE_PROVIDER: "openai" } as unknown as Env;
    await expect(
      openAiImageGenProvider.generate({ mode: "create", prompt: "x" }, env),
    ).rejects.toMatchObject({ code: "provider_not_configured", retryable: false });
  });
});
