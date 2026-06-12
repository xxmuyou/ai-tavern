import { jsonResponse, notFound, readJson } from "../http";
import type { UserRecord } from "../identity";
import {
  defaultVoiceIdForGender,
  defaultVoiceSpeed,
  isValidVoiceId,
  normalizeVoiceSpeed,
  type VoiceSpeedId,
} from "../voice/config";
import { canChatWithCompanion, loadCompanionForChat, type ChatCompanionRow } from "./loaders";

export type VoiceSettingSource = "user" | "companion" | "default";

export type EffectiveVoiceSetting = {
  source: VoiceSettingSource;
  voice_id: string;
  voice_speed: VoiceSpeedId;
};

type VoiceSettingRow = {
  voice_id: string;
  voice_speed: string | null;
};

type PatchBody = {
  voice_id?: unknown;
  voice_speed?: unknown;
};

export async function handleGetVoiceSettings(
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<Response> {
  const companion = await loadAccessibleCompanion(env, user, companionId);
  if (!companion) {
    return notFound();
  }
  return jsonResponse(await resolveEffectiveVoiceSetting(env, user.id, companion));
}

export async function handlePatchVoiceSettings(
  request: Request,
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<Response> {
  const companion = await loadAccessibleCompanion(env, user, companionId);
  if (!companion) {
    return notFound();
  }

  let body: PatchBody;
  try {
    body = await readJson<PatchBody>(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonResponse({ error: "invalid_request" }, { status: 400 });
  }

  const voiceId = typeof body.voice_id === "string" ? body.voice_id.trim() : "";
  if (!voiceId || !isValidVoiceId(env, voiceId)) {
    return jsonResponse({ error: "invalid_voice_id" }, { status: 400 });
  }

  const voiceSpeedRaw = typeof body.voice_speed === "string" ? body.voice_speed.trim().toLowerCase() : "";
  const voiceSpeed = normalizeVoiceSpeed(voiceSpeedRaw);
  if (!voiceSpeed) {
    return jsonResponse({ error: "invalid_voice_speed" }, { status: 400 });
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO user_companion_voice_settings
       (user_id, companion_id, voice_id, voice_speed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, companion_id) DO UPDATE SET
       voice_id = excluded.voice_id,
       voice_speed = excluded.voice_speed,
       updated_at = excluded.updated_at`,
  )
    .bind(user.id, companionId, voiceId, voiceSpeed, now, now)
    .run();

  return jsonResponse({ source: "user", voice_id: voiceId, voice_speed: voiceSpeed });
}

export async function resolveEffectiveVoiceSetting(
  env: Env,
  userId: string,
  companion: ChatCompanionRow,
): Promise<EffectiveVoiceSetting> {
  const userSetting = await loadUserVoiceSetting(env, userId, companion.id);
  if (userSetting) {
    return {
      source: "user",
      voice_id: userSetting.voice_id,
      voice_speed: normalizeVoiceSpeed(userSetting.voice_speed) ?? defaultVoiceSpeed(env),
    };
  }

  if (companion.voice_id) {
    return {
      source: "companion",
      voice_id: companion.voice_id,
      voice_speed: normalizeVoiceSpeed(companion.voice_speed) ?? defaultVoiceSpeed(env),
    };
  }

  return {
    source: "default",
    voice_id: defaultVoiceIdForGender(env, companion.gender),
    voice_speed: normalizeVoiceSpeed(companion.voice_speed) ?? defaultVoiceSpeed(env),
  };
}

async function loadAccessibleCompanion(
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<ChatCompanionRow | null> {
  const companion = await loadCompanionForChat(env, companionId);
  if (!companion || !canChatWithCompanion(companion, user)) {
    return null;
  }
  return companion;
}

async function loadUserVoiceSetting(
  env: Env,
  userId: string,
  companionId: string,
): Promise<VoiceSettingRow | null> {
  return env.DB.prepare(
    `SELECT voice_id, voice_speed
     FROM user_companion_voice_settings
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<VoiceSettingRow>();
}
