import { afterEach, describe, expect, it, vi } from "vitest";

import { handleVoiceRequest } from "./options";

vi.mock("../auth", () => ({
  requireAuthUser: vi.fn(async () => ({ email: "voice@test.local", id: "user_voice" })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("voice options endpoint", () => {
  it("returns public MiniMax voice options without group_id", async () => {
    const response = await handleVoiceRequest(
      new Request("http://localhost/voice/options"),
      { APP_ENV: "dev" } as Env,
      "/voice/options",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      group_id?: string;
      provider: string;
      speed_presets: Array<{ id: string; value: number }>;
      voices: Array<{ display_language_label?: string; id: string; language?: string }>;
    };
    expect(body.provider).toBe("minimax");
    expect(body.group_id).toBeUndefined();
    expect(body.speed_presets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "slow", value: 0.8 }),
        expect.objectContaining({ id: "medium", value: 1 }),
        expect.objectContaining({ id: "fast", value: 1.25 }),
      ]),
    );
    expect(body.voices.length).toBeGreaterThan(300);
    expect(body.voices.some((voice) => voice.id === "Arrogant_Miss")).toBe(true);
    expect(body.voices.find((voice) => voice.language === "en")?.display_language_label).toBe("English");
    expect(body.voices.find((voice) => voice.language === "ja")?.display_language_label).toBe("日本語");
  });

  it("rejects an invalid preview voice id", async () => {
    const response = await handleVoiceRequest(
      previewRequest({ voice_id: "missing-voice" }),
      makeVoiceEnv(),
      "/voice/preview",
    );

    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: "invalid_voice_id" });
  });

  it("generates and then reuses the global voice preview cache", async () => {
    const env = makeVoiceEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ base_resp: { status_code: 0 }, data: { audio: "0a0b0c" } }), {
          status: 200,
        }),
      ),
    );

    const first = await handleVoiceRequest(
      previewRequest({ voice_id: "Arrogant_Miss" }),
      env,
      "/voice/preview",
    );
    const second = await handleVoiceRequest(
      previewRequest({ voice_id: "Arrogant_Miss" }),
      env,
      "/voice/preview",
    );

    expect(first?.status).toBe(200);
    expect(second?.status).toBe(200);
    expect((await first?.json()) as { url: string }).toMatchObject({ url: expect.stringContaining("/objects/signed/voice-preview") });
    expect(env.ASSETS.put).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);

    const body = JSON.parse(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("speech-2.6-turbo");
    expect(body.text).toBe("Hi, I’m here with you. Let’s take this one moment at a time.");
    expect(body.voice_setting).toMatchObject({ speed: 1, voice_id: "Arrogant_Miss" });
  });

  it("uses a different preview cache key for a different voice id", async () => {
    const env = makeVoiceEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ base_resp: { status_code: 0 }, data: { audio: "0a0b0c" } }), {
          status: 200,
        }),
      ),
    );

    await handleVoiceRequest(previewRequest({ voice_id: "Arrogant_Miss" }), env, "/voice/preview");
    await handleVoiceRequest(previewRequest({ voice_id: "male-qn-qingse" }), env, "/voice/preview");

    expect(env.keys).toHaveLength(2);
    expect(new Set(env.keys).size).toBe(2);
  });

  it("returns 503 when preview must be generated but MiniMax is not configured", async () => {
    const env = makeVoiceEnv({ MINIMAX_API_KEY: undefined });

    const response = await handleVoiceRequest(
      previewRequest({ voice_id: "Arrogant_Miss" }),
      env,
      "/voice/preview",
    );

    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ error: "voice_not_configured" });
  });
});

function previewRequest(body: { voice_id: string }): Request {
  return new Request("http://localhost/voice/preview", {
    body: JSON.stringify(body),
    headers: { authorization: "Bearer test", "content-type": "application/json" },
    method: "POST",
  });
}

function makeVoiceEnv(overrides: Partial<Env> = {}): Env & { keys: string[]; ASSETS: { put: ReturnType<typeof vi.fn> } } {
  const objects = new Map<string, Uint8Array>();
  const keys: string[] = [];
  const env = {
    APP_ENV: "dev",
    IMAGE_GEN_PUBLIC_BASE_URL: "https://api.test",
    MINIMAX_API_KEY: "mm-test",
    R2_SIGNING_KEY: "signing-test",
    ASSETS: {
      async head(key: string) {
        return objects.has(key) ? ({ key } as R2Object) : null;
      },
      put: vi.fn(async (key: string, value: Uint8Array) => {
        keys.push(key);
        objects.set(key, value);
        return { key } as R2Object;
      }),
    },
    DB: {
      prepare() {
        throw new Error("settings table not available in this unit test");
      },
    },
    keys,
    ...overrides,
  } as unknown as Env & { keys: string[]; ASSETS: { put: ReturnType<typeof vi.fn> } };
  return env;
}
