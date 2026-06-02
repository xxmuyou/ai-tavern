import { afterEach, describe, expect, it, vi } from "vitest";

import { getImageGenProvider } from ".";
import { openAiImageGenProvider } from "./openai-provider";

describe("getImageGenProvider per-workflow routing", () => {
  it("routes WF1 and WF2 to independently configured providers", async () => {
    const env = {
      IMAGE_GEN_WF1_PROVIDER: "openai",
      IMAGE_GEN_WF2_PROVIDER: "runninghub",
    } as unknown as Env;

    expect((await getImageGenProvider(env, "create")).name).toBe("openai");
    expect((await getImageGenProvider(env, "variation")).name).toBe("runninghub");
  });

  it("routes WF_MOMENT by workflow key instead of create mode", async () => {
    const env = {
      IMAGE_GEN_WF1_PROVIDER: "openai",
      IMAGE_GEN_WF_MOMENT_PROVIDER: "runninghub",
    } as unknown as Env;

    expect((await getImageGenProvider(env, "create")).name).toBe("openai");
    expect((await getImageGenProvider(env, "create", "wf_moment")).name).toBe("runninghub");
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
      IMAGE_GEN_WF1_PROVIDER: "openai",
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
    const env = { IMAGE_GEN_WF1_PROVIDER: "openai" } as unknown as Env;
    await expect(
      openAiImageGenProvider.generate({ mode: "create", prompt: "x" }, env),
    ).rejects.toMatchObject({ code: "provider_not_configured", retryable: false });
  });
});
