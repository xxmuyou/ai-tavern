import { isAdminUser } from "../auth/guards";
import { jsonResponse, notFound, readJson } from "../http";
import type { UserRecord } from "../identity";
import { LLMError, llmCall } from "../llm";
import { loadActiveActivityForChat } from "../life/activity";
import { resolveThreadPersona } from "../personas";
import { applySignals, ensureRelationship, loadRelationship, type Signals } from "../relationships/engine";
import { ALL_DIMENSIONS, ZERO_DIMENSIONS } from "../relationships/level";
import { deriveStage } from "../relationships/stage";
import {
  detectAndRecordUnlocks,
  isSecretUnlocked,
  loadUnlockedKeys,
  type UnlockEvent,
} from "../relationships/unlocks";
import { loadStoryBeatForScene } from "../story-beats";
import { assessHostileInput, applyHostilityOverride } from "./hostility";
import {
  canChatWithCompanion,
  loadCompanionForChat,
  loadSceneForChat,
  loadThread,
  parseExampleDialogues,
  parseSceneTags,
} from "./loaders";
import { buildRelationshipNarrative } from "./narrative";
import { buildChatPrompt, type HistoryMessage } from "./prompt";
import { checkQuota, checkRateLimit, incrementQuota, isSubscriberActive } from "./quota";
import { extractSignals } from "./signal-extract";
import { formatDateUtc, recordUsage } from "./usage";
import { loadMessageRow } from "./variants";

const RECENT_MESSAGES_LIMIT = 50;

type EditBody = { text?: unknown };

/**
 * Edit a user message: rewrite its text, drop every message that came after it,
 * and generate a fresh companion reply for the new wording. Because the replies
 * after the edit point never happened in this new timeline, their relationship
 * signals are reverted so the relationship reflects only what now exists.
 *
 * Non-streaming on purpose: editing is rare, and a single JSON round-trip keeps
 * both the server and the client far simpler than re-deriving the SSE turn loop.
 */
export async function handleEditMessage(
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

  const target = await loadMessageRow(env, thread.id, messageId);
  if (!target) {
    return notFound();
  }
  if (target.role !== "user") {
    return jsonResponse({ error: "not_editable" }, { status: 400 });
  }

  let body: EditBody;
  try {
    body = await readJson<EditBody>(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonResponse({ error: "invalid_request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return jsonResponse({ error: "invalid_request", field: "text" }, { status: 400 });
  }

  const now = Date.now();
  const isAdmin = await isAdminUser(env, user.email);

  if (!isAdmin) {
    const rateCheck = await checkRateLimit(env, user.id, now);
    if (!rateCheck.ok) {
      return jsonResponse(
        { error: "rate_limited", message: "Too many messages this minute." },
        { status: 429, headers: { "retry-after": "60" } },
      );
    }
  }
  const subscriber = isAdmin || (await isSubscriberActive(env, user.id, now));
  if (!isAdmin) {
    const quotaCheck = await checkQuota(env, user.id, now, subscriber);
    if (!quotaCheck.ok) {
      return jsonResponse(
        { error: "quota_exceeded", message: "Daily message limit reached." },
        { status: 402 },
      );
    }
  }

  // Everything after the edited message is now a different timeline — delete it
  // and undo the relationship signals those (now-erased) replies had applied.
  const deletedCount = await truncateAfter(env, user.id, companionId, thread.id, target.created_at, now);

  await env.DB.prepare(`UPDATE messages SET content = ? WHERE id = ?`).bind(text, target.id).run();

  const priorMessages = await loadMessagesBefore(env, thread.id, target.created_at, RECENT_MESSAGES_LIMIT);

  const sceneId = target.scene_id;
  const scene = sceneId ? await loadSceneForChat(env, sceneId) : null;
  const activity = target.activity_id
    ? await loadActiveActivityForChat(env, user.id, target.activity_id)
    : null;
  const persona = await resolveThreadPersona(env, user.id, thread.persona_id);

  await ensureRelationship(env, user.id, companionId, now);
  const relationship = await loadRelationship(env, user.id, companionId);
  const dimensions = relationship?.dimensions ?? { ...ZERO_DIMENSIONS };
  const narrative = buildRelationshipNarrative(
    { dimensions, first_met_at: relationship?.first_met_at ?? now },
    now,
  );
  const stage = deriveStage(dimensions).stage;
  const unlockedKeys = await loadUnlockedKeys(env, user.id, companionId);
  const secretToReveal = isSecretUnlocked(unlockedKeys) ? companion.secret : null;
  const storyBeat = sceneId
    ? await loadStoryBeatForScene(env, user.id, companionId, sceneId)
    : null;

  const promptMessages = buildChatPrompt({
    companion,
    narrative,
    recentMessages: priorMessages,
    secretToReveal,
    stage,
    storyBeat,
    scene: scene ? { mood: scene.mood, name: scene.name, tags: parseSceneTags(scene.tags) } : null,
    activity: activity
      ? {
          type: activity.activity_type,
          mood: activity.daily_state_snapshot.mood,
          availability: activity.daily_state_snapshot.availability,
          activity_hint: activity.daily_state_snapshot.activity_hint,
        }
      : null,
    userPersona: persona
      ? { description: persona.description, gender: persona.gender, name: persona.name }
      : null,
    exampleDialogues: parseExampleDialogues(companion.example_dialogues),
    threadSummary: thread.summary,
    userText: text,
  });

  let reply: string;
  let usageTokens = { input_tokens: 0, output_tokens: 0 };
  try {
    const response = await llmCall(
      env,
      {
        frequency_penalty: 0.4,
        max_tokens: 700,
        messages: promptMessages,
        presence_penalty: 0.3,
        task: "chat",
        temperature: 0.95,
        top_p: 0.95,
      },
      { user_id: user.id },
    );
    reply = response.text;
    usageTokens = response.usage;
  } catch (err) {
    if (err instanceof LLMError) {
      return jsonResponse(
        { code: err.code, error: "llm_unavailable", message: err.message },
        { status: 503 },
      );
    }
    return jsonResponse(
      { error: "llm_unavailable", message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }

  const companionMessageId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO messages
       (id, thread_id, role, content, scene_id, activity_id, signals, emotion,
        llm_provider, llm_model, token_input, token_output, created_at)
     VALUES (?, ?, 'companion', ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)`,
  )
    .bind(
      companionMessageId,
      thread.id,
      reply,
      sceneId,
      target.activity_id,
      usageTokens.input_tokens,
      usageTokens.output_tokens,
      now,
    )
    .run();

  const extract = await extractSignals(env, {
    companionReply: reply,
    narrative,
    userId: user.id,
    userText: text,
  });
  const finalExtract = applyHostilityOverride(extract, assessHostileInput(text));
  let unlockEvents: UnlockEvent[] = [];
  if (finalExtract.ok) {
    try {
      await env.DB.prepare(`UPDATE messages SET signals = ?, emotion = ? WHERE id = ?`)
        .bind(JSON.stringify(finalExtract.signals), finalExtract.emotion, companionMessageId)
        .run();
      const newState = await applySignals(env, user.id, companionId, finalExtract.signals, now);
      try {
        const unlockResult = await detectAndRecordUnlocks(env, user.id, companionId, newState.dimensions, now);
        unlockEvents = unlockResult.newlyUnlocked;
      } catch {
        // unlock detection is best-effort
      }
    } catch {
      finalExtract.ok = false;
    }
  }

  const newCount = Math.max(0, thread.message_count - deletedCount + 1);
  await env.DB.prepare(`UPDATE threads SET message_count = ?, updated_at = ? WHERE id = ?`)
    .bind(newCount, now, thread.id)
    .run();

  void incrementQuota(env, user.id, now, subscriber);
  void recordUsage(env, user.id, formatDateUtc(now), 1, finalExtract.cost_usd);

  return jsonResponse({
    edited_message_id: target.id,
    emotion: finalExtract.emotion,
    message_id: companionMessageId,
    reply,
    signals: finalExtract.signals,
    unlocks: unlockEvents,
  });
}

type DeletedRow = { id: string; role: string; signals: string | null };

async function truncateAfter(
  env: Env,
  userId: string,
  companionId: string,
  threadId: string,
  afterTs: number,
  now: number,
): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT id, role, signals FROM messages WHERE thread_id = ? AND created_at > ?`,
  )
    .bind(threadId, afterTs)
    .all<DeletedRow>();
  const rows = results ?? [];
  if (rows.length === 0) return 0;

  // Undo the relationship movement that the erased companion replies caused.
  for (const row of rows) {
    if (row.role !== "companion" || !row.signals) continue;
    const delta = parseSignalDelta(row.signals);
    if (!delta) continue;
    try {
      await applySignals(env, userId, companionId, negateSignals(delta), now);
    } catch {
      // best-effort revert; never block the edit on it
    }
  }

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");
  await env.DB.prepare(`DELETE FROM story_moment_images WHERE message_id IN (${placeholders})`)
    .bind(...ids)
    .run();
  await env.DB.prepare(`DELETE FROM chat_outfit_images WHERE message_id IN (${placeholders})`)
    .bind(...ids)
    .run();
  await env.DB.prepare(`DELETE FROM messages WHERE thread_id = ? AND created_at > ?`)
    .bind(threadId, afterTs)
    .run();

  return rows.length;
}

function parseSignalDelta(raw: string): Signals | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Signals;
    }
  } catch {
    // fall through
  }
  return null;
}

export function negateSignals(delta: Signals): Signals {
  const out: Signals = {};
  for (const dim of ALL_DIMENSIONS) {
    const value = delta[dim];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[dim] = -value;
    }
  }
  return out;
}

async function loadMessagesBefore(
  env: Env,
  threadId: string,
  beforeTs: number,
  limit: number,
): Promise<HistoryMessage[]> {
  const { results } = await env.DB.prepare(
    `SELECT role, content, created_at FROM messages
     WHERE thread_id = ? AND created_at < ?
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(threadId, beforeTs, limit)
    .all<{ role: string; content: string; created_at: number }>();

  return (results ?? [])
    .filter((r): r is { role: "user" | "companion"; content: string; created_at: number } =>
      r.role === "user" || r.role === "companion",
    )
    .slice()
    .reverse()
    .map((r) => ({ content: r.content, role: r.role }));
}
