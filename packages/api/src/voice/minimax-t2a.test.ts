import { afterEach, describe, expect, it, vi } from "vitest";

import { hexToBytes, synthesizeSpeech, VoiceError } from "./minimax-t2a";
import { defaultVoiceIdForGender, loadMiniMaxVoiceConfig, speedValueForPreset } from "./config";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hexToBytes", () => {
  it("decodes a hex string to bytes", () => {
    expect(Array.from(hexToBytes("00ff10"))).toEqual([0, 255, 16]);
  });
});

describe("MiniMax voice config", () => {
  it("loads repo-managed defaults and speed presets", () => {
    const config = loadMiniMaxVoiceConfig({ APP_ENV: "dev" } as Env);
    expect(config.model).toBe("speech-2.6-turbo");
    expect(config.group_id).toBe("2061321948939424466");
    expect(config.voices.length).toBeGreaterThan(300);
    expect(defaultVoiceIdForGender({ APP_ENV: "dev" } as Env, "female")).toBe("Arrogant_Miss");
    expect(defaultVoiceIdForGender({ APP_ENV: "dev" } as Env, "male")).toBe("male-qn-qingse");
    expect(speedValueForPreset({ APP_ENV: "dev" } as Env, "slow")).toBe(0.8);
    expect(speedValueForPreset({ APP_ENV: "dev" } as Env, "fast")).toBe(1.25);
  });
});

describe("synthesizeSpeech", () => {
  const env = { MINIMAX_API_KEY: "k" } as Env;
  const opts = { groupId: "g", model: "speech-2.6-turbo", speed: 1.25, text: "hi", voiceId: "female-tianmei" };

  it("throws voice_not_configured without key/group", async () => {
    await expect(
      synthesizeSpeech({} as Env, opts),
    ).rejects.toMatchObject({ code: "voice_not_configured" });
  });

  it("returns decoded audio bytes on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ base_resp: { status_code: 0 }, data: { audio: "0a0b0c" } }), {
          status: 200,
        }),
      ),
    );
    const bytes = await synthesizeSpeech(env, opts);
    expect(Array.from(bytes)).toEqual([10, 11, 12]);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.minimaxi.com/v1/t2a_v2?GroupId=g");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("speech-2.6-turbo");
    expect(body.voice_setting).toMatchObject({ speed: 1.25, voice_id: "female-tianmei" });
  });

  it("throws voice_provider_error on a non-zero status_code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ base_resp: { status_code: 1004, status_msg: "auth failed" } }), {
          status: 200,
        }),
      ),
    );
    await expect(synthesizeSpeech(env, opts)).rejects.toBeInstanceOf(VoiceError);
  });
});
