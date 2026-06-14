import { requireAuthUser } from "../auth";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import { loadActiveActivityForChat } from "../life/activity";
import { computeTimeSlot } from "../life/time-slot";
import { loadRelationship } from "../relationships/engine";
import { ZERO_DIMENSIONS } from "../relationships/level";
import { deriveStage } from "../relationships/stage";
import { loadStoryBeatForScene } from "../story-beats";
import { loadBaseArtJob, reserveImageGenerationCredits } from "../image-gen/base-art";
import { pollStaleRunningHubArtJobs } from "../image-gen/runninghub-results";
import { releaseReservation } from "../credits";
import {
  buildMomentPrompt,
  createMomentImageJob,
  loadMomentByJob,
  loadMomentByMessage,
  reconcileMomentFromJob,
  regenerateMomentImageJob,
  type MomentPromptContext,
  type StoryMomentImageRow,
} from "../image-gen/moment-image";
import { extractMomentVisualAction } from "../image-gen/moment-action";
import { classifyMomentScene } from "../image-gen/moment-style";
import { loadCompanionForChat, loadSceneForChat, parseSceneTags } from "./loaders";

/**
 * spec-027 Chat Moment Images:
 *   POST /chat/messages/{message_id}/moment-image/generate
 *   GET  /moment-images/jobs/{job_id}
 */
export async function handleMomentImageRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const generateMatch = pathname.match(
    /^\/chat\/messages\/([^/]+)\/moment-image\/generate$/,
  );
  if (generateMatch) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const messageId = decodeURIComponent(generateMatch[1] ?? "");
    if (!messageId) {
      return jsonResponse({ error: "invalid_message_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    const force = new URL(request.url).searchParams.get("force") === "1";
    return handleGenerate(env, user, messageId, force);
  }

  const jobMatch = pathname.match(/^\/moment-images\/jobs\/([^/]+)$/);
  if (jobMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const jobId = decodeURIComponent(jobMatch[1] ?? "");
    if (!jobId) {
      return jsonResponse({ error: "invalid_job_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    return handleJobStatus(env, user, jobId);
  }

  return null;
}

type MessageRow = {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  scene_id: string | null;
  activity_id: string | null;
  emotion: string | null;
  created_at: number;
};

type ThreadOwnerRow = {
  id: string;
  user_id: string;
  companion_id: string;
};

function momentResponse(row: StoryMomentImageRow): Response {
  return jsonResponse(
    {
      job_id: row.job_id,
      moment_id: row.id,
      output_key: row.output_key ?? undefined,
      status: row.status,
    },
    { status: 202 },
  );
}

async function handleGenerate(
  env: Env,
  user: UserRecord,
  messageId: string,
  force = false,
): Promise<Response> {
  const message = await env.DB.prepare(
    `SELECT id, thread_id, role, content, scene_id, activity_id, emotion, created_at
     FROM messages WHERE id = ?`,
  )
    .bind(messageId)
    .first<MessageRow>();
  if (!message) {
    return notFound();
  }

  const thread = await env.DB.prepare(
    `SELECT id, user_id, companion_id FROM threads WHERE id = ?`,
  )
    .bind(message.thread_id)
    .first<ThreadOwnerRow>();
  if (!thread || thread.user_id !== user.id) {
    // Hide existence of other users' threads.
    return notFound();
  }

  if (message.role !== "companion") {
    return jsonResponse({ error: "not_companion_message" }, { status: 422 });
  }

  // Dedup: an in-flight or succeeded moment is returned as-is so the user is not
  // charged twice. A failed/cancelled one always retries (same row, new job); an
  // explicit `force` (the "Regenerate image" button) also re-runs a succeeded one.
  const existing = await loadMomentByMessage(env, user.id, messageId);
  if (existing) {
    const job = await loadBaseArtJob(env, existing.job_id);
    const reconciled = job ? await reconcileMomentFromJob(env, existing, job) : existing;
    const isTerminalFailure = reconciled.status === "failed" || reconciled.status === "cancelled";
    const shouldRegenerate = isTerminalFailure || (force && reconciled.status === "succeeded");
    if (!shouldRegenerate) {
      return momentResponse(reconciled);
    }
    const reservation = await reserveImageGenerationCredits(env, user.id);
    if (!reservation.ok) {
      return jsonResponse({ error: "credits_insufficient" }, { status: 402 });
    }
    try {
      const prompt = await composePrompt(env, user, thread, message);
      const { momentId } = await regenerateMomentImageJob(env, reconciled, prompt, reservation.reservationId);
      const next = await loadMomentByMessage(env, user.id, messageId);
      return momentResponse(next ?? { ...reconciled, id: momentId, status: "queued", output_key: null });
    } catch (err) {
      await releaseReservation(env, reservation.reservationId, "create_failed");
      throw err;
    }
  }

  const storyBeat = message.scene_id
    ? await loadStoryBeatForScene(env, user.id, thread.companion_id, message.scene_id)
    : null;
  const reservation = await reserveImageGenerationCredits(env, user.id);
  if (!reservation.ok) {
    return jsonResponse({ error: "credits_insufficient" }, { status: 402 });
  }
  try {
    const prompt = await composePrompt(env, user, thread, message);
    const { jobId, momentId } = await createMomentImageJob(env, {
      activityId: message.activity_id,
      companionId: thread.companion_id,
      emotion: message.emotion,
      messageId,
      promptSnapshot: prompt,
      sceneId: message.scene_id,
      storyBeatId: storyBeat?.status === "active" ? storyBeat.id : null,
      threadId: thread.id,
      userId: user.id,
      billingRef: reservation.reservationId,
    });

    return jsonResponse(
      { job_id: jobId, moment_id: momentId, status: "queued" },
      { status: 202 },
    );
  } catch (err) {
    await releaseReservation(env, reservation.reservationId, "create_failed");
    throw err;
  }
}

async function composePrompt(
  env: Env,
  user: UserRecord,
  thread: ThreadOwnerRow,
  message: MessageRow,
): Promise<string> {
  const sceneId = message.scene_id;
  const [companion, scene, relationship, storyBeat, previousUser, activity] = await Promise.all([
    loadCompanionForChat(env, thread.companion_id),
    sceneId ? loadSceneForChat(env, sceneId) : Promise.resolve(null),
    loadRelationship(env, user.id, thread.companion_id),
    sceneId ? loadStoryBeatForScene(env, user.id, thread.companion_id, sceneId) : Promise.resolve(null),
    loadPreviousUserText(env, thread.id, message.created_at),
    message.activity_id
      ? loadActiveActivityForChat(env, user.id, message.activity_id)
      : Promise.resolve(null),
  ]);

  const stage = deriveStage(relationship?.dimensions ?? { ...ZERO_DIMENSIONS }).stage;
  const tz = await loadUserTimezone(env, user.id);
  const sceneTags = parseSceneTags(scene?.tags ?? null);
  const { venue, privacy } = classifyMomentScene(
    scene ? { name: scene.name, tags: sceneTags } : null,
  );

  const ctx: MomentPromptContext = {
    activity: activity
      ? {
          activity_hint: activity.daily_state_snapshot.activity_hint,
          activity_type: activity.activity_type,
          mood: activity.daily_state_snapshot.mood,
        }
      : null,
    companion: {
      gender: companion?.gender ?? null,
      id: companion?.id ?? thread.companion_id,
      name: companion?.name ?? "the companion",
      personality: companion?.personality ?? null,
      relationship_role: companion?.relationship_role ?? null,
    },
    emotion: message.emotion,
    previousUserText: previousUser,
    privacy,
    scene: {
      mood: scene?.mood ?? "private conversation",
      name: scene?.name ?? "Private chat",
      tags: sceneTags,
    },
    sourceReply: message.content,
    stage,
    storyBeat: storyBeat?.status === "active" ? { objective: storyBeat.objective, title: storyBeat.title } : null,
    timeSlot: computeTimeSlot(new Date(), tz),
  };

  const visualAction = await extractMomentVisualAction(env, {
    activity: ctx.activity,
    companionId: ctx.companion.id,
    companionGender: ctx.companion.gender,
    companionName: ctx.companion.name,
    emotion: ctx.emotion,
    previousUserText: ctx.previousUserText,
    sceneMood: ctx.scene.mood,
    sceneName: ctx.scene.name,
    scenePrivacy: privacy,
    sceneVenue: venue,
    sourceReply: ctx.sourceReply,
    stage: ctx.stage,
    userId: user.id,
  });

  return buildMomentPrompt({ ...ctx, visualAction });
}

async function loadPreviousUserText(
  env: Env,
  threadId: string,
  beforeCreatedAt: number,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT content FROM messages
     WHERE thread_id = ? AND role = 'user' AND created_at < ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(threadId, beforeCreatedAt)
    .first<{ content: string }>();
  return row?.content ?? null;
}

async function loadUserTimezone(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare(`SELECT timezone FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ timezone: string | null }>();
  return row?.timezone ?? "UTC";
}

async function handleJobStatus(
  env: Env,
  user: UserRecord,
  jobId: string,
): Promise<Response> {
  const moment = await loadMomentByJob(env, jobId);
  if (!moment || moment.user_id !== user.id) {
    return notFound();
  }
  let job = await loadBaseArtJob(env, jobId);
  if (job && isMaybeStale(job.status, job.updated_at)) {
    await pollStaleRunningHubArtJobs(env);
    job = await loadBaseArtJob(env, jobId);
  }
  const reconciled = job ? await reconcileMomentFromJob(env, moment, job) : moment;

  return jsonResponse({
    error_code: job?.error_code ?? undefined,
    error_message: job?.error_message ?? undefined,
    job_id: jobId,
    output_key: reconciled.output_key ?? undefined,
    status: reconciled.status,
  });
}

function isMaybeStale(status: string, updatedAt: number): boolean {
  if (status === "succeeded" || status === "failed" || status === "cancelled") {
    return false;
  }
  return Date.now() - updatedAt > 2 * 60 * 1000;
}
