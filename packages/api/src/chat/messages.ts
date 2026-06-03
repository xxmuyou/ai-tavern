import { isAdminUser } from "../auth/guards";
import { jsonResponse, notFound, readJson } from "../http";
import type { UserRecord } from "../identity";
import { LLMError, llmStream, type LLMStreamChunk, type LLMUsage } from "../llm";
import { maybeCreateConflictEvent } from "../events/conflict";
import { loadActiveActivityForChat } from "../life/activity";
import { applySignals, ensureRelationship, loadRelationship } from "../relationships/engine";
import type { DimensionValues } from "../relationships/level";
import { ZERO_DIMENSIONS } from "../relationships/level";
import { deriveStage } from "../relationships/stage";
import { completeCurrentStoryBeat, loadStoryBeatForScene } from "../story-beats";
import {
  detectAndRecordUnlocks,
  isSecretUnlocked,
  loadUnlockedKeys,
  type UnlockEvent,
} from "../relationships/unlocks";
import {
  canChatWithCompanion,
  ensureThread,
  loadCompanionForChat,
  loadSceneForChat,
  parseSceneTags,
  type ChatThreadRow,
} from "./loaders";
import { buildRelationshipNarrative } from "./narrative";
import { buildChatPrompt } from "./prompt";
import { applyHostilityOverride, assessHostileInput } from "./hostility";
import {
  checkQuota,
  checkRateLimit,
  incrementQuota,
  isSubscriberActive,
} from "./quota";
import { extractSignals, type Emotion } from "./signal-extract";
import { createSSEStream, type SSEHandle } from "./sse";
import { maybeEnqueueSummary } from "./summary-queue";
import { formatDateUtc, recordUsage } from "./usage";

const RECENT_MESSAGES_LIMIT = 50;

type PostBody = { text?: unknown; scene_id?: unknown; activity_id?: unknown };

type HistoryRow = { role: "user" | "companion"; content: string };

export async function handlePostMessage(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  user: UserRecord,
  companionId: string,
): Promise<Response> {
  let body: PostBody;
  try {
    body = await readJson<PostBody>(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonResponse({ error: "invalid_request" }, { status: 400 });
  }

  const userText = typeof body.text === "string" ? body.text.trim() : "";
  if (!userText) {
    return jsonResponse({ error: "invalid_request", field: "text" }, { status: 400 });
  }
  let sceneIdInput = typeof body.scene_id === "string" && body.scene_id.length > 0 ? body.scene_id : null;
  const activityIdInput = typeof body.activity_id === "string" && body.activity_id.length > 0 ? body.activity_id : null;
  const activity = activityIdInput
    ? await loadActiveActivityForChat(env, user.id, activityIdInput)
    : null;
  if (activityIdInput && !activity) {
    return jsonResponse({ error: "activity_not_active" }, { status: 422 });
  }
  // When chat is locked to an activity, force the scene to match so the
  // companion does not "teleport" mid-conversation.
  if (activity) {
    sceneIdInput = activity.scene_id;
  }

  const companion = await loadCompanionForChat(env, companionId);
  if (!companion) {
    return notFound();
  }
  if (!canChatWithCompanion(companion, user)) {
    return jsonResponse({ error: "forbidden" }, { status: 403 });
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

  const scene = sceneIdInput ? await loadSceneForChat(env, sceneIdInput) : null;
  await ensureRelationship(env, user.id, companionId, now);
  const relationship = await loadRelationship(env, user.id, companionId);
  const narrative = buildRelationshipNarrative(
    {
      dimensions: relationship?.dimensions ?? { ...ZERO_DIMENSIONS },
      first_met_at: relationship?.first_met_at ?? now,
    },
    now,
  );

  const thread = await ensureThread(env, user.id, companionId, now);
  const recentMessages = await loadRecentMessages(env, thread.id, RECENT_MESSAGES_LIMIT);

  // spec-025: gate the secret on unlock state, and feed the current stage so
  // the prompt can pick how intimately the character addresses the user.
  const stage = deriveStage(relationship?.dimensions ?? { ...ZERO_DIMENSIONS }).stage;
  const unlockedKeys = await loadUnlockedKeys(env, user.id, companionId);
  const secretToReveal = isSecretUnlocked(unlockedKeys) ? companion.secret : null;
  const storyBeat = sceneIdInput
    ? await loadStoryBeatForScene(env, user.id, companionId, sceneIdInput)
    : null;

  const promptMessages = buildChatPrompt({
    companion,
    narrative,
    recentMessages,
    secretToReveal,
    stage,
    storyBeat,
    scene: scene
      ? { mood: scene.mood, name: scene.name, tags: parseSceneTags(scene.tags) }
      : null,
    activity: activity
      ? {
          type: activity.activity_type,
          mood: activity.daily_state_snapshot.mood,
          availability: activity.daily_state_snapshot.availability,
          activity_hint: activity.daily_state_snapshot.activity_hint,
        }
      : null,
    threadSummary: thread.summary,
    userText,
  });

  // Pull the first chunk before opening the SSE response so we can surface
  // "all providers failed" as a clean 503 JSON instead of an empty event stream.
  const iterator = llmStream(
    env,
    {
      // Roomier + livelier sampling so replies read as a person with flavor,
      // not a clipped assistant. frequency/presence penalties cut samey phrasing.
      frequency_penalty: 0.4,
      max_tokens: 700,
      messages: promptMessages,
      presence_penalty: 0.3,
      task: "chat",
      temperature: 0.95,
      top_p: 0.95,
    },
    { user_id: user.id },
  )[Symbol.asyncIterator]();
  let firstResult: IteratorResult<LLMStreamChunk>;
  try {
    firstResult = await iterator.next();
  } catch (err) {
    return llmFailureResponse(err);
  }

  const sse = createSSEStream();
  ctx.waitUntil(
    runChat({
      activity_id: activityIdInput,
      companionId,
      ctx,
      env,
      firstResult,
      iterator,
      narrative,
      now,
      scene_id: sceneIdInput,
      sse,
      subscriber,
      thread,
      user,
      userText,
    }),
  );
  return sse.response;
}

type RunChatArgs = {
  env: Env;
  sse: SSEHandle;
  iterator: AsyncIterator<LLMStreamChunk>;
  firstResult: IteratorResult<LLMStreamChunk>;
  user: UserRecord;
  companionId: string;
  thread: ChatThreadRow;
  scene_id: string | null;
  activity_id: string | null;
  narrative: string;
  userText: string;
  subscriber: boolean;
  now: number;
  ctx: ExecutionContext;
};

async function runChat(args: RunChatArgs): Promise<void> {
  const { env, sse, iterator, firstResult, user, companionId, thread, scene_id, activity_id, narrative, userText, subscriber, now, ctx } =
    args;

  let replyBuffer = "";
  let call1Usage: LLMUsage = { input_tokens: 0, output_tokens: 0 };
  let companionMessageId: string | null = null;
  let conflictSignals: Partial<DimensionValues> | null = null;
  let unlockEvents: UnlockEvent[] = [];

  const handleChunk = (chunk: LLMStreamChunk): void => {
    if (chunk.type === "text") {
      replyBuffer += chunk.text;
      sse.writeEvent("chunk", { text: chunk.text });
    } else if (chunk.type === "done") {
      call1Usage = chunk.usage;
    }
  };

  try {
    if (!firstResult.done) {
      handleChunk(firstResult.value);
    }
    let result = firstResult;
    while (!result.done) {
      result = await iterator.next();
      if (!result.done) handleChunk(result.value);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sse.writeEvent("error", { code: "LLM_UNAVAILABLE", message });
    sse.close();
    return;
  }

  // Persist both messages and bump the thread before signal extraction.
  try {
    const persistResult = await persistMessages({
      activityId: activity_id,
      companionId,
      companionReply: replyBuffer,
      env,
      now,
      sceneId: scene_id,
      thread,
      tokens: call1Usage,
      userId: user.id,
      userText,
    });
    companionMessageId = persistResult.companionMessageId;
    void incrementQuota(env, user.id, now, subscriber);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sse.writeEvent("error", { code: "INTERNAL", message });
    sse.close();
    return;
  }

  const extract = await extractSignals(env, {
    companionReply: replyBuffer,
    narrative,
    userId: user.id,
    userText,
  });
  const hostilityAssessment = assessHostileInput(userText);
  const finalExtract = applyHostilityOverride(extract, hostilityAssessment);

  if (finalExtract.ok && companionMessageId) {
    try {
      await env.DB.prepare(
        `UPDATE messages SET signals = ?, emotion = ? WHERE id = ?`,
      )
        .bind(JSON.stringify(finalExtract.signals), finalExtract.emotion, companionMessageId)
        .run();
      const newState = await applySignals(env, user.id, companionId, finalExtract.signals, now);
      conflictSignals = finalExtract.signals;
      // spec-025: detect stage-transition unlocks off the freshly applied
      // dimensions and surface any newly granted unlocks to the client.
      try {
        const unlockResult = await detectAndRecordUnlocks(
          env,
          user.id,
          companionId,
          newState.dimensions,
          now,
        );
        unlockEvents = unlockResult.newlyUnlocked;
      } catch {
        // Unlock detection is best-effort; never break the reply for it.
      }
      try {
        await completeCurrentStoryBeat(env, user.id, companionId, scene_id, now);
      } catch {
        // Story progression is best-effort; never break the reply for it.
      }
    } catch (err) {
      // Persistence of signals failed but reply is already saved; degrade to warning.
      finalExtract.ok = false;
    }
  }

  sse.writeEvent("signals", finalExtract.signals);
  sse.writeEvent("emotion", { value: finalExtract.emotion satisfies Emotion });
  sse.writeEvent("unlocks", unlockEvents);
  sse.writeEvent("done", {
    message_id: companionMessageId,
    usage: {
      input_tokens: call1Usage.input_tokens,
      output_tokens: call1Usage.output_tokens,
    },
    warning: finalExtract.ok ? null : "signal_extract_failed",
  });
  sse.close();

  if (conflictSignals) {
    ctx.waitUntil(
      maybeCreateConflictEvent({
        companionId,
        env,
        narrative,
        now,
        sceneId: scene_id,
        signalsDelta: conflictSignals,
        userId: user.id,
      }),
    );
  }

  const totalCost = finalExtract.cost_usd; // call 1 cost is logged inside llmStream.
  void recordUsage(env, user.id, formatDateUtc(now), 1, totalCost);
  void maybeEnqueueSummary(env, thread.id, thread.message_count + 2);
}

type PersistInput = {
  env: Env;
  userId: string;
  companionId: string;
  thread: ChatThreadRow;
  sceneId: string | null;
  activityId: string | null;
  userText: string;
  companionReply: string;
  tokens: LLMUsage;
  now: number;
};

async function persistMessages(input: PersistInput): Promise<{ companionMessageId: string }> {
  const { env, thread, sceneId, activityId, userText, companionReply, tokens, now } = input;
  const userMessageId = crypto.randomUUID();
  const companionMessageId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO messages
       (id, thread_id, role, content, scene_id, activity_id, signals, emotion,
        llm_provider, llm_model, token_input, token_output, created_at)
     VALUES (?, ?, 'user', ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?)`,
  )
    .bind(userMessageId, thread.id, userText, sceneId, activityId, now)
    .run();

  await env.DB.prepare(
    `INSERT INTO messages
       (id, thread_id, role, content, scene_id, activity_id, signals, emotion,
        llm_provider, llm_model, token_input, token_output, created_at)
     VALUES (?, ?, 'companion', ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)`,
  )
    .bind(
      companionMessageId,
      thread.id,
      companionReply,
      sceneId,
      activityId,
      tokens.input_tokens,
      tokens.output_tokens,
      now + 1,
    )
    .run();

  await env.DB.prepare(
    `UPDATE threads SET message_count = message_count + 2, updated_at = ? WHERE id = ?`,
  )
    .bind(now, thread.id)
    .run();

  thread.message_count = thread.message_count + 2;
  return { companionMessageId };
}

async function loadRecentMessages(
  env: Env,
  threadId: string,
  limit: number,
): Promise<HistoryRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT role, content, created_at FROM messages
     WHERE thread_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(threadId, limit)
    .all<{ role: string; content: string; created_at: number }>();

  const rows = (results ?? []).filter(
    (r): r is { role: "user" | "companion"; content: string; created_at: number } =>
      r.role === "user" || r.role === "companion",
  );

  return rows
    .slice()
    .reverse()
    .map((r) => ({ content: r.content, role: r.role }));
}

function llmFailureResponse(err: unknown): Response {
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
