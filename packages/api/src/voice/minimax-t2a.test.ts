import { afterEach, describe, expect, it, vi } from "vitest";

import { hexToBytes, synthesizeSpeech, voiceIdForGender, VoiceError } from "./minimax-t2a";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hexToBytes", () => {
  it("decodes a hex string to bytes", () => {
    expect(Array.from(hexToBytes("00ff10"))).toEqual([0, 255, 16]);
  });
});

describe("voiceIdForGender", () => {
  it("uses gendered defaults and honours overrides", () => {
    expect(voiceIdForGender({} as Env, "male")).toBe("male-qn-qingse");
    expect(voiceIdForGender({} as Env, "female")).toBe("female-tianmei");
    expect(voiceIdForGender({} as Env, null)).toBe("female-tianmei");
    expect(voiceIdForGender({ MINIMAX_TTS_VOICE_MALE: "custom" } as Env, "male")).toBe("custom");
  });
});

describe("synthesizeSpeech", () => {
  const env = { MINIMAX_API_KEY: "k", MINIMAX_GROUP_ID: "g" } as Env;

  it("throws voice_not_configured without key/group", async () => {
    await expect(
      synthesizeSpeech({} as Env, { text: "hi", voiceId: "v" }),
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
    const bytes = await synthesizeSpeech(env, { text: "hi", voiceId: "female-tianmei" });
    expect(Array.from(bytes)).toEqual([10, 11, 12]);
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
    await expect(synthesizeSpeech(env, { text: "hi", voiceId: "v" })).rejects.toBeInstanceOf(VoiceError);
  });
});
