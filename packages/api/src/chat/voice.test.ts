import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockCreditsError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
    ) {
      super(code);
      this.name = "CreditsError";
    }
  }

  return {
    commitReservation: vi.fn(),
    isAdminUser: vi.fn(),
    releaseReservation: vi.fn(),
    reserveCredits: vi.fn(),
    synthesizeSpeech: vi.fn(),
    voiceGenerationCreditCost: vi.fn(),
    MockCreditsError,
  };
});

vi.mock("../auth/guards", () => ({ isAdminUser: mocks.isAdminUser }));
vi.mock("../credits", () => ({
  commitReservation: mocks.commitReservation,
  CreditsError: mocks.MockCreditsError,
  releaseReservation: mocks.releaseReservation,
  reserveCredits: mocks.reserveCredits,
  voiceGenerationCreditCost: mocks.voiceGenerationCreditCost,
}));
vi.mock("../voice/minimax-t2a", () => ({
  synthesizeSpeech: mocks.synthesizeSpeech,
  VoiceError: class VoiceError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "VoiceError";
    }
  },
}));
vi.mock("../image-gen/signed-url", () => ({
  createSignedObjectUrl: async (_env: Env, key: string) => `https://assets.test/${key}`,
}));

import { handleMessageVoice, spokenText } from "./voice";
import { handleGetVoiceSettings, handlePatchVoiceSettings } from "./voice-settings";

describe("spokenText", () => {
  it("drops narration and keeps spoken dialogue", () => {
    const content = "<narration>She leaned in.</narration>You came back.<narration>A smile.</narration>";
    expect(spokenText(content)).toBe("You came back.");
  });

  it("collapses whitespace across kept fragments", () => {
    expect(spokenText("Hey.<narration>x</narration>  How are you?")).toBe("Hey. How are you?");
  });

  it("falls back to the full stripped text when it is all narration", () => {
    expect(spokenText("<narration>She just watched, silent.</narration>")).toBe("She just watched, silent.");
  });

  it("normalizes malformed narration tags before choosing spoken text", () => {
    expect(spokenText("<n narration>她笑了。</x narration>早。<stage>bad tag</stage>")).toBe("早。bad tag");
  });
});

describe("chat voice settings", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("stores per-user voice settings for official companions", async () => {
    const env = createVoiceEnv();
    const user = { email: "u1@test.local", id: "u1" };

    const patch = await handlePatchVoiceSettings(
      jsonRequest({ voice_id: "male-qn-badao", voice_speed: "fast" }),
      env,
      user,
      "c1",
    );
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({ source: "user", voice_id: "male-qn-badao", voice_speed: "fast" });

    const own = await handleGetVoiceSettings(env, user, "c1");
    expect(await own.json()).toMatchObject({ source: "user", voice_id: "male-qn-badao", voice_speed: "fast" });

    const other = await handleGetVoiceSettings(env, { email: "u2@test.local", id: "u2" }, "c1");
    expect(await other.json()).toMatchObject({ source: "default", voice_id: "Arrogant_Miss", voice_speed: "medium" });
  });

  it("rejects invalid voice settings", async () => {
    const env = createVoiceEnv();
    const user = { email: "u1@test.local", id: "u1" };

    const badVoice = await handlePatchVoiceSettings(
      jsonRequest({ voice_id: "missing-voice", voice_speed: "medium" }),
      env,
      user,
      "c1",
    );
    expect(badVoice.status).toBe(400);
    expect(await badVoice.json()).toMatchObject({ error: "invalid_voice_id" });

    const badSpeed = await handlePatchVoiceSettings(
      jsonRequest({ voice_id: "male-qn-badao", voice_speed: "turbo" }),
      env,
      user,
      "c1",
    );
    expect(badSpeed.status).toBe(400);
    expect(await badSpeed.json()).toMatchObject({ error: "invalid_voice_speed" });
  });
});

describe("handleMessageVoice billing", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("charges once for the first successful voice generation and replays free", async () => {
    const env = createVoiceEnv();
    env.settings.set("u1:c1", { voice_id: "male-qn-badao", voice_speed: "fast" });
    mocks.reserveCredits.mockResolvedValueOnce({ available_credits: 9, reservation_id: "res_1", reserved_credits: 1 });

    const first = await handleMessageVoice(new Request("https://api.test"), env, user("u1"), "c1", "m1");
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ url: expect.stringContaining("chat-voice/m1-") });
    expect(mocks.reserveCredits).toHaveBeenCalledWith(env, expect.objectContaining({
      amount: 1,
      referenceType: "voice_generation",
      taskType: "voice_generation",
      userId: "u1",
    }));
    expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(env, expect.objectContaining({
      voiceId: "male-qn-badao",
      speed: 1.25,
    }));
    expect(mocks.commitReservation).toHaveBeenCalledWith(env, "res_1");

    const second = await handleMessageVoice(new Request("https://api.test"), env, user("u1"), "c1", "m1");
    expect(second.status).toBe(200);
    expect(mocks.reserveCredits).toHaveBeenCalledTimes(1);
    expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it("charges again when the same message uses a different voice", async () => {
    const env = createVoiceEnv();
    mocks.reserveCredits
      .mockResolvedValueOnce({ available_credits: 9, reservation_id: "res_1", reserved_credits: 1 })
      .mockResolvedValueOnce({ available_credits: 8, reservation_id: "res_2", reserved_credits: 1 });

    await handleMessageVoice(new Request("https://api.test"), env, user("u1"), "c1", "m1");
    env.settings.set("u1:c1", { voice_id: "male-qn-badao", voice_speed: "medium" });
    await handleMessageVoice(new Request("https://api.test"), env, user("u1"), "c1", "m1");

    expect(mocks.reserveCredits).toHaveBeenCalledTimes(2);
    expect(mocks.commitReservation).toHaveBeenNthCalledWith(2, env, "res_2");
  });

  it("returns 402 without calling MiniMax when credits are insufficient", async () => {
    const env = createVoiceEnv();
    mocks.reserveCredits.mockRejectedValueOnce(new mocks.MockCreditsError("credits_insufficient", 402));

    const response = await handleMessageVoice(new Request("https://api.test"), env, user("u1"), "c1", "m1");
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: "credits_insufficient" });
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
    expect(env.charges).toHaveLength(0);
  });

  it("releases reserved credits when synthesis fails", async () => {
    const env = createVoiceEnv();
    mocks.reserveCredits.mockResolvedValueOnce({ available_credits: 9, reservation_id: "res_1", reserved_credits: 1 });
    mocks.synthesizeSpeech.mockRejectedValueOnce(new Error("provider down"));

    const response = await handleMessageVoice(new Request("https://api.test"), env, user("u1"), "c1", "m1");
    expect(response.status).toBe(502);
    expect(mocks.releaseReservation).toHaveBeenCalledWith(env, "res_1", "voice_provider_error");
    expect(mocks.commitReservation).not.toHaveBeenCalled();
    expect(env.charges).toHaveLength(0);
  });
});

function resetMocks() {
  mocks.isAdminUser.mockResolvedValue(false);
  mocks.reserveCredits.mockReset();
  mocks.commitReservation.mockReset();
  mocks.releaseReservation.mockReset();
  mocks.synthesizeSpeech.mockReset();
  mocks.synthesizeSpeech.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.voiceGenerationCreditCost.mockReset();
  mocks.voiceGenerationCreditCost.mockResolvedValue(1);
}

function user(id: string) {
  return { email: `${id}@test.local`, id };
}

function jsonRequest(body: unknown): Request {
  return new Request("https://api.test", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

type VoiceEnv = Env & {
  assets: Map<string, Uint8Array>;
  charges: Array<{
    companion_id: string;
    message_id: string;
    reservation_id: string;
    user_id: string;
    voice_id: string;
    voice_speed: string;
  }>;
  settings: Map<string, { voice_id: string; voice_speed: string }>;
};

function createVoiceEnv(): VoiceEnv {
  const assets = new Map<string, Uint8Array>();
  const config = new Map<string, string>();
  const settings = new Map<string, { voice_id: string; voice_speed: string }>();
  const charges: VoiceEnv["charges"] = [];
  const companion = {
    appearance: null,
    background: null,
    boundary: null,
    created_by: null,
    example_dialogues: null,
    gender: "female",
    greeting: null,
    id: "c1",
    is_active: 1,
    name: "Maya",
    personality: null,
    relationship_role: null,
    secret: null,
    source: "official",
    speech_style: null,
    voice_id: null,
    voice_speed: "medium",
    want: null,
  };
  const thread = { created_at: 1, id: "t1", message_count: 1, persona_id: null, summary: null, updated_at: 1 };
  const message = {
    activity_id: null,
    content: "Hello there.",
    created_at: 1,
    id: "m1",
    role: "companion",
    scene_id: null,
    selected_variant: null,
    thread_id: "t1",
    variants: null,
  };

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first() {
              if (sql.includes("FROM companions")) return values[0] === "c1" ? companion : null;
              if (sql.includes("FROM threads")) return values[0] === "u1" && values[1] === "c1" ? thread : null;
              if (sql.includes("FROM messages")) return values[0] === "m1" && values[1] === "t1" ? message : null;
              if (sql.includes("FROM user_companion_voice_settings")) {
                const [userId, companionId] = values as [string, string];
                return settings.get(`${userId}:${companionId}`) ?? null;
              }
              if (sql.includes("FROM voice_generation_charges")) {
                const [userId, companionId, messageId, voiceId, voiceSpeed] = values as [string, string, string, string, string];
                return charges.find((row) =>
                  row.user_id === userId &&
                  row.companion_id === companionId &&
                  row.message_id === messageId &&
                  row.voice_id === voiceId &&
                  row.voice_speed === voiceSpeed
                ) ?? null;
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO user_companion_voice_settings")) {
                const [userId, companionId, voiceId, voiceSpeed] = values as [string, string, string, string];
                settings.set(`${userId}:${companionId}`, { voice_id: voiceId, voice_speed: voiceSpeed });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO voice_generation_charges")) {
                const [, userId, companionId, messageId, voiceId, voiceSpeed, reservationId] = values as [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  number,
                ];
                if (charges.some((row) =>
                  row.user_id === userId &&
                  row.companion_id === companionId &&
                  row.message_id === messageId &&
                  row.voice_id === voiceId &&
                  row.voice_speed === voiceSpeed
                )) {
                  throw new Error("UNIQUE constraint failed: voice_generation_charges");
                }
                charges.push({
                  companion_id: companionId,
                  message_id: messageId,
                  reservation_id: reservationId,
                  user_id: userId,
                  voice_id: voiceId,
                  voice_speed: voiceSpeed,
                });
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
          };
        },
      };
    },
  };

  return {
    APP_ENV: "dev",
    ASSETS: {
      async head(key: string) {
        return assets.has(key) ? {} : null;
      },
      async put(key: string, value: Uint8Array) {
        assets.set(key, value);
      },
    },
    CONFIG: {
      async get(key: string) {
        return config.get(key) ?? null;
      },
      async put(key: string, value: string) {
        config.set(key, value);
      },
    },
    DB: db,
    assets,
    charges,
    settings,
  } as unknown as VoiceEnv;
}
