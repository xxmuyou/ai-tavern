import { isAdminUser } from "../auth/guards";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import { LLMError, llmStream, type LLMStreamChunk, type LLMUsage } from "../llm";
import { loadActiveActivityForChat } from "../life/activity";
import { resolveThreadPersona } from "../personas";
import { ensureRelationship, loadRelationship } from "../relationships/engine";
import { ZERO_DIMENSIONS } from "../relationships/level";
import { deriveStage } from "../relationships/stage";
import { isSecretUnlocked, loadUnlockedKeys } from "../relationships/unlocks";
import { loadStoryBeatForScene } from "../story-beats";
import {
  canChatWithCompanion,
  loadCompanionForChat,
  loadSceneForChat,
  loadThread,
  parseExampleDialogues,
  parseSceneTags,
} from "./loaders";
import {
  loadThreadMemories,
  savePromptDebugSnapshot,
  shouldWritePromptDebug,
} from "./memory";
import { buildRelationshipNarrative } from "./narrative";
import { buildChatPromptArtifacts, type HistoryMessage, type UserPersonaForPrompt } from "./prompt";
import { checkRateLimit, incrementQuota, isSubscriberActive } from "./quota";
import { createStreamingReplyNormalizer } from "./reply-normalize";
import { commitReservation, releaseReservation } from "../credits";
import { reserveChatCredits } from "./messages";
import { createSSEStream, type SSEHandle } from "./sse";
import { formatDateUtc, recordUsage } from "./usage";
import { loadMessageRow, parseVariants } from "./variants";

const RECENT_MESSAGES_LIMIT = 50;

/**
 * Regenerate a companion reply. Produces a new alternative wording, appends it to
 * the message's variant list, and selects it. The relationship trajectory is
 * intentionally left untouched: the user's turn did not change, so the signals
 * already applied still stand — regenerate only re-words the reply.
 */
export async function handleRegenerateMessage(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
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
  if (target.role !== "companion") {
    return jsonResponse({ error: "not_regeneratable" }, { status: 400 });
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
  // Pure-credits model (spec-021): a regeneration is a new LLM call, charged
  // like a message. Admins exempt; commit after persist, release on failure.
  let chatReservationId: string | null = null;
  if (!isAdmin) {
    const reservation = await reserveChatCredits(env, user.id);
    if (!reservation.ok) {
      return jsonResponse(
        { error: "credits_insufficient", message: "Not enough credits." },
        { status: 402 },
      );
    }
    chatReservationId = reservation.reservationId;
  }

  // Reconstruct the context this reply answered: everything before it, with the
  // last user turn pulled out as the prompt's trailing user message.
  const priorRows = await loadMessagesBefore(env, thread.id, target.created_at, RECENT_MESSAGES_LIMIT);
  const { recentMessages, userText } = splitTrailingUserTurn(priorRows);

  const sceneId = target.scene_id;
  const scene = sceneId ? await loadSceneForChat(env, sceneId) : null;
  const activity = target.activity_id
    ? await loadActiveActivityForChat(env, user.id, target.activity_id)
    : null;
  const persona = await resolveThreadPersona(env, user.id, thread.persona_id);
  const userPersonaForPrompt: UserPersonaForPrompt = persona
    ? { description: persona.description, gender: persona.gender, name: persona.name }
    : null;

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
  const threadMemories = await loadThreadMemories(env, thread.id);

  const promptArtifacts = buildChatPromptArtifacts({
    companion,
    narrative,
    recentMessages,
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
    threadMemories,
    userPersona: userPersonaForPrompt,
    exampleDialogues: parseExampleDialogues(companion.example_dialogues),
    threadSummary: thread.summary,
    userText,
  });
  if (shouldWritePromptDebug(env, isAdmin)) {
    ctx.waitUntil(
      savePromptDebugSnapshot(env, {
        companionId,
        messageId,
        now,
        segments: promptArtifacts.segments,
        threadId: thread.id,
        tokenEstimate: promptArtifacts.tokenEstimate,
        userId: user.id,
      }),
    );
  }

  const iterator = llmStream(
    env,
    {
      frequency_penalty: 0.4,
      max_tokens: 700,
      messages: promptArtifacts.messages,
      presence_penalty: 0.3,
      task: "chat",
      // A touch hotter than the first pass so a regeneration reads as a genuine
      // alternative rather than a near-duplicate.
      temperature: 1.0,
      top_p: 0.95,
    },
    { user_id: user.id },
  )[Symbol.asyncIterator]();

  let firstResult: IteratorResult<LLMStreamChunk>;
  try {
    firstResult = await iterator.next();
  } catch (err) {
    if (chatReservationId) {
      await releaseReservation(env, chatReservationId, "llm_unavailable");
    }
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

  const existingVariants = parseVariants(target.variants, target.content);
  const sse = createSSEStream();
  ctx.waitUntil(
    runRegenerate({
      chatReservationId,
      env,
      existingVariants,
      firstResult,
      iterator,
      messageId,
      now,
      sse,
      subscriber,
      user,
    }),
  );
  return sse.response;
}

type RunRegenerateArgs = {
  env: Env;
  sse: SSEHandle;
  iterator: AsyncIterator<LLMStreamChunk>;
  firstResult: IteratorResult<LLMStreamChunk>;
  user: UserRecord;
  messageId: string;
  existingVariants: string[];
  subscriber: boolean;
  chatReservationId: string | null;
  now: number;
};

async function runRegenerate(args: RunRegenerateArgs): Promise<void> {
  const { env, sse, iterator, firstResult, user, messageId, existingVariants, subscriber, chatReservationId, now } = args;

  let replyBuffer = "";
  let usage: LLMUsage = { input_tokens: 0, output_tokens: 0 };
  const replyNormalizer = createStreamingReplyNormalizer();

  const handleChunk = (chunk: LLMStreamChunk): void => {
    if (chunk.type === "text") {
      const clean = replyNormalizer.push(chunk.text);
      if (clean.length > 0) {
        replyBuffer += clean;
        sse.writeEvent("chunk", { text: clean });
      }
    } else if (chunk.type === "done") {
      usage = chunk.usage;
    }
  };

  try {
    if (!firstResult.done) handleChunk(firstResult.value);
    let result = firstResult;
    while (!result.done) {
      result = await iterator.next();
      if (!result.done) handleChunk(result.value);
    }
    const tail = replyNormalizer.flush();
    if (tail.length > 0) {
      replyBuffer += tail;
      sse.writeEvent("chunk", { text: tail });
    }
  } catch (err) {
    if (chatReservationId) {
      await releaseReservation(env, chatReservationId, "llm_stream_failed");
    }
    const message = err instanceof Error ? err.message : String(err);
    sse.writeEvent("error", { code: "LLM_UNAVAILABLE", message });
    sse.close();
    return;
  }

  const variants = [...existingVariants, replyBuffer];
  const selectedVariant = variants.length - 1;

  try {
    await env.DB.prepare(
      `UPDATE messages
       SET content = ?, variants = ?, selected_variant = ?, token_input = ?, token_output = ?
       WHERE id = ?`,
    )
      .bind(replyBuffer, JSON.stringify(variants), selectedVariant, usage.input_tokens, usage.output_tokens, messageId)
      .run();
    void incrementQuota(env, user.id, now, subscriber);
  } catch (err) {
    if (chatReservationId) {
      await releaseReservation(env, chatReservationId, "persist_failed");
    }
    const message = err instanceof Error ? err.message : String(err);
    sse.writeEvent("error", { code: "INTERNAL", message });
    sse.close();
    return;
  }

  // Regeneration persisted — commit the chat credit reservation.
  if (chatReservationId) {
    await commitReservation(env, chatReservationId);
  }

  sse.writeEvent("done", {
    message_id: messageId,
    selected_variant: selectedVariant,
    variants,
  });
  sse.close();

  void recordUsage(env, user.id, formatDateUtc(now), 1, 0);
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

/**
 * Split a chronological message list into the trailing user turn (the prompt's
 * final user message) and everything before it (the conversation context).
 */
function splitTrailingUserTurn(messages: HistoryMessage[]): {
  recentMessages: HistoryMessage[];
  userText: string;
} {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return {
        recentMessages: messages.slice(0, i),
        userText: messages[i]?.content ?? "",
      };
    }
  }
  return { recentMessages: messages, userText: "" };
}
