import { isAdminUser } from "../auth/guards";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import { createSignedObjectUrl } from "../image-gen/signed-url";
import { synthesizeSpeech, voiceIdForGender, VoiceError } from "../voice/minimax-t2a";
import { canChatWithCompanion, loadCompanionForChat, loadThread } from "./loaders";
import { checkRateLimit } from "./quota";
import { loadMessageRow } from "./variants";

// Bump when synthesis params change (volume, model, etc.) so cached clips that
// were rendered with the old settings are no longer reused.
const VOICE_RENDER_VERSION = "4";

/**
 * Generate (or reuse) spoken audio for a companion reply and return a signed
 * URL to it. Voice is free for everyone, but rate-limited like chat to keep the
 * provider bill in check. Audio is cached in R2 under a content-hash key so a
 * replay — or a different variant — does not re-bill the provider.
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
  const voiceId = voiceIdForGender(env, companion.gender);
  const key = `chat-voice/${messageId}-${await shortHash(`${VOICE_RENDER_VERSION}|${voiceId}|${text}`)}.mp3`;

  const existing = await env.ASSETS.head(key);
  if (!existing) {
    try {
      const bytes = await synthesizeSpeech(env, { text, voiceId });
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

  const url = await createSignedObjectUrl(env, key);
  return jsonResponse({ url });
}

/**
 * Reduce a reply to just its spoken words: drop the <narration> stage directions
 * and any stray tags. Falls back to the whole stripped line if it was all
 * narration, so we never return silence for a valid message.
 */
export function spokenText(content: string): string {
  const withoutNarration = content.replace(/<narration>[\s\S]*?<\/narration>/gi, " ");
  const dialogue = stripTags(withoutNarration);
  if (dialogue) return dialogue;
  return stripTags(content);
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
