import { isAdminUser } from "../auth/guards";
import {
  commitReservation,
  CreditsError,
  releaseReservation,
  reserveCredits,
  voiceGenerationCreditCost,
} from "../credits";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import { createSignedObjectUrl } from "../image-gen/signed-url";
import { loadMiniMaxVoiceConfig, speedValueForPreset } from "../voice/config";
import { synthesizeSpeech, VoiceError } from "../voice/minimax-t2a";
import { canChatWithCompanion, loadCompanionForChat, loadThread } from "./loaders";
import { checkRateLimit } from "./quota";
import { normalizeChatReplyText } from "./reply-normalize";
import { loadMessageRow } from "./variants";
import { resolveEffectiveVoiceSetting } from "./voice-settings";

// Bump when synthesis params change (volume, model, etc.) so cached clips that
// were rendered with the old settings are no longer reused.
const VOICE_RENDER_VERSION = "5";

/**
 * Generate (or reuse) spoken audio for a companion reply and return a signed
 * URL to it. The first successful voice request for a user/message/voice/speed
 * is billed with voice_generation credits; replaying the same cached clip is
 * free for that user. Audio is cached in R2 under a content-hash key so repeated
 * playback does not re-bill the provider.
 */
export async function handleMessageVoice(
  request: Request,
  env: Env,
  user: UserRecord,
  companionId: string,
  messageId: string,
): Promise<Response> {
  const companion = await loadCompanionForChat(env, companionId);
  if (!companion || !canChatWithCompanion(companion, user)) {
    return notFound();
  }
  const thread = await loadThread(env, user.id, companionId);
  if (!thread) {
    return notFound();
  }
  const message = await loadMessageRow(env, thread.id, messageId);
  if (!message || message.role !== "companion") {
    return notFound();
  }

  const now = Date.now();
  const isAdmin = await isAdminUser(env, user.email);
  if (!isAdmin) {
    const rate = await checkRateLimit(env, user.id, now);
    if (!rate.ok) {
      return jsonResponse(
        { error: "rate_limited", message: "Too many requests this minute." },
        { status: 429, headers: { "retry-after": "60" } },
      );
    }
  }

  const text = spokenText(message.content);
  if (!text) {
    return jsonResponse({ error: "nothing_to_speak" }, { status: 422 });
  }

  // Cache key covers everything that changes the rendered audio: the voice id
  // and a render version we bump whenever synthesis params (e.g. volume) change,
  // so old clips are not served after a tuning change.
  const config = loadMiniMaxVoiceConfig(env);
  const voiceSetting = await resolveEffectiveVoiceSetting(env, user.id, companion);
  const voiceId = voiceSetting.voice_id;
  const voiceSpeed = voiceSetting.voice_speed;
  const speed = speedValueForPreset(env, voiceSpeed);
  const key = `chat-voice/${messageId}-${await shortHash(`${VOICE_RENDER_VERSION}|${voiceId}|${voiceSpeed}|${text}`)}.mp3`;

  let reservationId: string | null = null;
  let chargeId: string | null = null;
  const needsCharge = !isAdmin && !(await hasVoiceGenerationCharge(env, user.id, companionId, messageId, voiceId, voiceSpeed));
  if (needsCharge) {
    const amount = await voiceGenerationCreditCost(env);
    try {
      chargeId = crypto.randomUUID();
      const reservation = await reserveCredits(env, {
        amount,
        referenceId: chargeId,
        referenceType: "voice_generation",
        taskType: "voice_generation",
        userId: user.id,
      });
      reservationId = reservation.reservation_id;
    } catch (err) {
      if (err instanceof CreditsError && err.code === "credits_insufficient") {
        return jsonResponse(
          { error: "credits_insufficient", message: "Not enough credits." },
          { status: 402 },
        );
      }
      throw err;
    }
  }

  const existing = await env.ASSETS.head(key);
  if (!existing) {
    try {
      const bytes = await synthesizeSpeech(env, {
        groupId: config.group_id,
        model: config.model,
        speed,
        text,
        voiceId,
      });
      await env.ASSETS.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
    } catch (err) {
      if (err instanceof VoiceError) {
        if (reservationId) {
          await releaseReservation(env, reservationId, err.code);
        }
        return jsonResponse(
          { error: err.code, message: err.message },
          { status: err.code === "voice_not_configured" ? 503 : 502 },
        );
      }
      if (reservationId) {
        await releaseReservation(env, reservationId, "voice_provider_error");
      }
      return jsonResponse(
        { error: "voice_provider_error", message: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      );
    }
  }

  if (needsCharge && reservationId && chargeId) {
    const charged = await recordVoiceGenerationCharge(env, {
      chargeId,
      companionId,
      messageId,
      reservationId,
      userId: user.id,
      voiceId,
      voiceSpeed,
    });
    if (charged) {
      await commitReservation(env, reservationId);
    } else {
      await releaseReservation(env, reservationId, "duplicate_voice_generation");
    }
  }

  const url = await createSignedObjectUrl(env, key);
  return jsonResponse({ url });
}

/**
 * Reduce a reply to just its spoken words: drop the <narration> stage directions
 * and any stray tags. Falls back to the whole stripped line if it was all
 * narration, so we never return silence for a valid message.
 */
export function spokenText(content: string): string {
  const normalized = normalizeChatReplyText(content);
  const withoutNarration = normalized.replace(/<narration>[\s\S]*?<\/narration>/gi, " ");
  const dialogue = stripTags(withoutNarration);
  if (dialogue) return dialogue;
  return stripTags(normalized);
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function shortHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 4; i += 1) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return hex;
}

async function hasVoiceGenerationCharge(
  env: Env,
  userId: string,
  companionId: string,
  messageId: string,
  voiceId: string,
  voiceSpeed: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id
     FROM voice_generation_charges
     WHERE user_id = ? AND companion_id = ? AND message_id = ?
       AND voice_id = ? AND voice_speed = ?`,
  )
    .bind(userId, companionId, messageId, voiceId, voiceSpeed)
    .first<{ id: string }>();
  return Boolean(row);
}

async function recordVoiceGenerationCharge(
  env: Env,
  input: {
    chargeId: string;
    companionId: string;
    messageId: string;
    reservationId: string;
    userId: string;
    voiceId: string;
    voiceSpeed: string;
  },
): Promise<boolean> {
  try {
    await env.DB.prepare(
      `INSERT INTO voice_generation_charges
         (id, user_id, companion_id, message_id, voice_id, voice_speed, reservation_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        input.chargeId,
        input.userId,
        input.companionId,
        input.messageId,
        input.voiceId,
        input.voiceSpeed,
        input.reservationId,
        Date.now(),
      )
      .run();
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) {
      return false;
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.toLowerCase().includes("unique");
}
