import { requireAuthUser } from "../auth";
import { jsonResponse, readJson } from "../http";
import { createSignedObjectUrl } from "../image-gen/signed-url";
import {
  isValidVoiceId,
  loadMiniMaxVoiceConfig,
  publicVoiceOptions,
  speedValueForPreset,
} from "./config";
import { synthesizeSpeech, VoiceError } from "./minimax-t2a";

const VOICE_PREVIEW_RENDER_VERSION = "1";
const VOICE_PREVIEW_TEXT = "Hi, I’m here with you. Let’s take this one moment at a time.";

export async function handleVoiceRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/voice/options") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    return jsonResponse(publicVoiceOptions(env));
  }

  if (pathname === "/voice/preview") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    await requireAuthUser(env, request);
    return handleVoicePreview(request, env);
  }

  return null;
}

async function handleVoicePreview(request: Request, env: Env): Promise<Response> {
  let body: { voice_id?: unknown };
  try {
    body = await readJson<{ voice_id?: unknown }>(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }

  const voiceId = typeof body.voice_id === "string" ? body.voice_id.trim() : "";
  if (!voiceId || !isValidVoiceId(env, voiceId)) {
    return jsonResponse({ error: "invalid_voice_id" }, { status: 400 });
  }

  const config = loadMiniMaxVoiceConfig(env);
  const speedPreset = "medium";
  const speed = speedValueForPreset(env, speedPreset);
  const key = `voice-preview/${await shortHash(
    `${VOICE_PREVIEW_RENDER_VERSION}|${config.model}|${VOICE_PREVIEW_TEXT}|${voiceId}|${speedPreset}`,
  )}.mp3`;

  const existing = await env.ASSETS.head(key);
  if (!existing) {
    try {
      const bytes = await synthesizeSpeech(env, {
        groupId: config.group_id,
        model: config.model,
        speed,
        text: VOICE_PREVIEW_TEXT,
        voiceId,
      });
      await env.ASSETS.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
    } catch (err) {
      if (err instanceof VoiceError) {
        return jsonResponse(
          { error: err.code, message: err.message },
          { status: err.code === "voice_not_configured" ? 503 : 502 },
        );
      }
      return jsonResponse(
        { error: "voice_provider_error", message: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      );
    }
  }

  try {
    const url = await createSignedObjectUrl(env, key);
    return jsonResponse({ url });
  } catch (err) {
    return jsonResponse(
      { error: "voice_not_configured", message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}

async function shortHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 8; i += 1) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return hex;
}
