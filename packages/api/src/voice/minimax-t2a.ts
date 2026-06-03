// MiniMax T2A v2 (text-to-speech). Unlike MiniMax chat (OpenAI-compatible), T2A
// needs the account GroupId as a query param. With stream=false the audio comes
// back as a hex-encoded string that we decode to raw bytes.
const T2A_URL = "https://api.minimaxi.com/v1/t2a_v2";
const DEFAULT_MODEL = "speech-02-turbo";
const DEFAULT_VOICE_FEMALE = "female-tianmei";
const DEFAULT_VOICE_MALE = "male-qn-qingse";

export type VoiceErrorCode = "voice_not_configured" | "voice_provider_error";

export class VoiceError extends Error {
  constructor(
    readonly code: VoiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VoiceError";
  }
}

type MiniMaxT2AResponse = {
  data?: { audio?: string; status?: number };
  base_resp?: { status_code?: number; status_msg?: string };
};

export function voiceIdForGender(env: Env, gender: string | null): string {
  if (gender === "male") return env.MINIMAX_TTS_VOICE_MALE ?? DEFAULT_VOICE_MALE;
  return env.MINIMAX_TTS_VOICE_FEMALE ?? DEFAULT_VOICE_FEMALE;
}

export async function synthesizeSpeech(
  env: Env,
  opts: { text: string; voiceId: string; speed?: number },
): Promise<Uint8Array> {
  const apiKey = env.MINIMAX_API_KEY;
  const groupId = env.MINIMAX_GROUP_ID;
  if (!apiKey || !groupId) {
    throw new VoiceError(
      "voice_not_configured",
      "MINIMAX_API_KEY and MINIMAX_GROUP_ID are required for voice.",
    );
  }

  const model = env.MINIMAX_TTS_MODEL ?? DEFAULT_MODEL;

  let response: Response;
  try {
    response = await fetch(`${T2A_URL}?GroupId=${encodeURIComponent(groupId)}`, {
      body: JSON.stringify({
        // 44.1kHz / 256kbps removes the compression harshness ("破音") that the
        // lower 32k/128k setting added on sibilants; measured clean at vol 3.
        audio_setting: { bitrate: 256000, channel: 1, format: "mp3", sample_rate: 44100 },
        // Let MiniMax detect each reply's language (zh / en / …) and optimise the
        // pronunciation for it, so an English reply read by a Chinese-timbre voice
        // still sounds right instead of accented.
        language_boost: "auto",
        model,
        stream: false,
        text: opts.text,
        // MiniMax vol range is (0, 10]; default 1 is too quiet, 4+ clips. vol 3 at
        // 44.1k/256k measured 0% clipping with ~1.4dB headroom — loud and clean.
        voice_setting: { pitch: 0, speed: opts.speed ?? 1, vol: 3, voice_id: opts.voiceId },
      }),
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      method: "POST",
    });
  } catch (err) {
    throw new VoiceError("voice_provider_error", err instanceof Error ? err.message : String(err));
  }

  if (!response.ok) {
    throw new VoiceError("voice_provider_error", `MiniMax T2A HTTP ${response.status}`);
  }

  const payload = (await response.json()) as MiniMaxT2AResponse;
  const statusCode = payload.base_resp?.status_code;
  const audioHex = payload.data?.audio;
  if (statusCode !== 0 || !audioHex) {
    throw new VoiceError(
      "voice_provider_error",
      payload.base_resp?.status_msg ?? "MiniMax T2A returned no audio",
    );
  }

  return hexToBytes(audioHex);
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const length = Math.floor(clean.length / 2);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = Number.parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}
