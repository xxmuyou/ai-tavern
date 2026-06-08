import { requireAuthUser } from "../auth";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import { loadActiveActivityForChat } from "../life/activity";
import { computeTimeSlot } from "../life/time-slot";
import { loadRelationship } from "../relationships/engine";
import { ZERO_DIMENSIONS } from "../relationships/level";
import { deriveStage } from "../relationships/stage";
import { loadBaseArtJob, reserveImageGenerationCredits } from "../image-gen/base-art";
import { releaseReservation } from "../credits";
import {
  buildOutfitPrompt,
  createOutfitImageJob,
  findOutfitRecommendation,
  getOutfitRecommendations,
  loadCompanionOutfitSource,
  loadOutfitByJob,
  loadOutfitByMessage,
  reconcileOutfitFromJob,
  regenerateOutfitImageJob,
  validateCustomOutfitPrompt,
  type ChatOutfitImageRow,
  type OutfitPromptContext,
  type OutfitPromptSource,
} from "../image-gen/outfit-image";
import { loadCompanionForChat, loadSceneForChat, parseSceneTags } from "./loaders";

/**
 * spec-030 Chat Outfit Images:
 *   GET  /chat/messages/{message_id}/outfit-image/recommendations
 *   POST /chat/messages/{message_id}/outfit-image/generate
 *   GET  /outfit-images/jobs/{job_id}
 */
export async function handleOutfitImageRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const recommendationsMatch = pathname.match(
    /^\/chat\/messages\/([^/]+)\/outfit-image\/recommendations$/,
  );
  if (recommendationsMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const messageId = decodeURIComponent(recommendationsMatch[1] ?? "");
    if (!messageId) {
      return jsonResponse({ error: "invalid_message_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    return handleRecommendations(env, user, messageId);
  }

  const generateMatch = pathname.match(
    /^\/chat\/messages\/([^/]+)\/outfit-image\/generate$/,
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
    return handleGenerate(request, env, user, messageId);
  }

  const jobMatch = pathname.match(/^\/outfit-images\/jobs\/([^/]+)$/);
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
  created_at: number;
};

type ThreadOwnerRow = {
  id: string;
  user_id: string;
  companion_id: string;
};

type GenerateBody =
  | { source?: "recommended"; recommendation_id?: unknown }
  | { source?: "custom"; prompt?: unknown };

function outfitResponse(row: ChatOutfitImageRow): Response {
  return jsonResponse(
    {
      job_id: row.job_id,
      outfit_id: row.id,
      output_key: row.output_key ?? undefined,
      status: row.status,
    },
    { status: 202 },
  );
}

async function handleRecommendations(
  env: Env,
  user: UserRecord,
  messageId: string,
): Promise<Response> {
  const loaded = await loadMessageAndThread(env, user, messageId);
  if (!loaded.ok) return loaded.response;

  const ctx = await composeContext(env, user, loaded.thread, loaded.message);
  return jsonResponse({ recommendations: getOutfitRecommendations(ctx) });
}

async function handleGenerate(
  request: Request,
  env: Env,
  user: UserRecord,
  messageId: string,
): Promise<Response> {
  const loaded = await loadMessageAndThread(env, user, messageId);
  if (!loaded.ok) return loaded.response;

  const existing = await loadOutfitByMessage(env, user.id, messageId);
  if (existing) {
    const job = await loadBaseArtJob(env, existing.job_id);
    const reconciled = job ? await reconcileOutfitFromJob(env, existing, job) : existing;
    if (reconciled.status !== "failed" && reconciled.status !== "cancelled") {
      return outfitResponse(reconciled);
    }
  }

  const sourceArtUrl = await loadCompanionOutfitSource(env, loaded.thread.companion_id);
  if (!sourceArtUrl) {
    return jsonResponse({ error: "source_image_required" }, { status: 422 });
  }

  const body = (await request.json().catch(() => null)) as GenerateBody | null;
  const parsed = await parseOutfitPrompt(env, user, loaded.thread, loaded.message, body);
  if (!parsed.ok) return parsed.response;

  const reservation = await reserveImageGenerationCredits(env, user.id);
  if (!reservation.ok) {
    return jsonResponse({ error: "credits_insufficient" }, { status: 402 });
  }

  if (existing) {
    try {
      const { jobId, outfitId } = await regenerateOutfitImageJob(env, existing, {
        outfitPrompt: parsed.outfitPrompt,
        promptSnapshot: parsed.promptSnapshot,
        promptSource: parsed.promptSource,
        billingRef: reservation.reservationId,
      });
      const next = await loadOutfitByMessage(env, user.id, messageId);
      return outfitResponse(next ?? {
        ...existing,
        id: outfitId,
        job_id: jobId,
        output_key: null,
        status: "queued",
      });
    } catch (err) {
      await releaseReservation(env, reservation.reservationId, "create_failed");
      throw err;
    }
  }

  try {
    const { jobId, outfitId } = await createOutfitImageJob(env, {
      companionId: loaded.thread.companion_id,
      messageId,
      outfitPrompt: parsed.outfitPrompt,
      promptSnapshot: parsed.promptSnapshot,
      promptSource: parsed.promptSource,
      threadId: loaded.thread.id,
      userId: user.id,
      billingRef: reservation.reservationId,
    });

    return jsonResponse(
      { job_id: jobId, outfit_id: outfitId, status: "queued" },
      { status: 202 },
    );
  } catch (err) {
    await releaseReservation(env, reservation.reservationId, "create_failed");
    throw err;
  }
}

async function parseOutfitPrompt(
  env: Env,
  user: UserRecord,
  thread: ThreadOwnerRow,
  message: MessageRow,
  body: GenerateBody | null,
): Promise<
  | { ok: true; outfitPrompt: string; promptSnapshot: string; promptSource: OutfitPromptSource }
  | { ok: false; response: Response }
> {
  const rawBody = body ?? {};
  const source = rawBody.source;
  const ctx = await composeContext(env, user, thread, message);

  if (source === "recommended") {
    const recommendationId =
      typeof rawBody.recommendation_id === "string" ? rawBody.recommendation_id.trim() : "";
    if (!recommendationId) {
      return {
        ok: false,
        response: jsonResponse({ error: "recommendation_id_required" }, { status: 400 }),
      };
    }
    const recommendation = findOutfitRecommendation(ctx, recommendationId);
    if (!recommendation) {
      return {
        ok: false,
        response: jsonResponse({ error: "invalid_recommendation_id" }, { status: 400 }),
      };
    }
    return {
      ok: true,
      outfitPrompt: recommendation.prompt,
      promptSnapshot: buildOutfitPrompt(ctx, recommendation.prompt),
      promptSource: "recommended",
    };
  }

  if (source === "custom") {
    const validated = validateCustomOutfitPrompt(rawBody.prompt);
    if (!validated.ok) {
      return {
        ok: false,
        response: jsonResponse(
          { error: validated.error },
          { status: validated.error === "unsafe_prompt" ? 422 : 400 },
        ),
      };
    }
    return {
      ok: true,
      outfitPrompt: validated.prompt,
      promptSnapshot: buildOutfitPrompt(ctx, validated.prompt),
      promptSource: "custom",
    };
  }

  return {
    ok: false,
    response: jsonResponse({ error: "invalid_source" }, { status: 400 }),
  };
}

async function loadMessageAndThread(
  env: Env,
  user: UserRecord,
  messageId: string,
): Promise<
  | { ok: true; message: MessageRow; thread: ThreadOwnerRow }
  | { ok: false; response: Response }
> {
  const message = await env.DB.prepare(
    `SELECT id, thread_id, role, content, scene_id, activity_id, created_at
     FROM messages WHERE id = ?`,
  )
    .bind(messageId)
    .first<MessageRow>();
  if (!message) {
    return { ok: false, response: notFound() };
  }

  const thread = await env.DB.prepare(
    `SELECT id, user_id, companion_id FROM threads WHERE id = ?`,
  )
    .bind(message.thread_id)
    .first<ThreadOwnerRow>();
  if (!thread || thread.user_id !== user.id) {
    return { ok: false, response: notFound() };
  }

  if (message.role !== "companion") {
    return {
      ok: false,
      response: jsonResponse({ error: "not_companion_message" }, { status: 422 }),
    };
  }

  return { message, ok: true, thread };
}

async function composeContext(
  env: Env,
  user: UserRecord,
  thread: ThreadOwnerRow,
  message: MessageRow,
): Promise<OutfitPromptContext> {
  const sceneId = message.scene_id;
  const [companion, scene, relationship, activity, timezone] = await Promise.all([
    loadCompanionForChat(env, thread.companion_id),
    sceneId ? loadSceneForChat(env, sceneId) : Promise.resolve(null),
    loadRelationship(env, user.id, thread.companion_id),
    message.activity_id
      ? loadActiveActivityForChat(env, user.id, message.activity_id)
      : Promise.resolve(null),
    loadUserTimezone(env, user.id),
  ]);

  const stage = deriveStage(relationship?.dimensions ?? { ...ZERO_DIMENSIONS }).stage;
  return {
    activity: activity
      ? {
          activity_hint: activity.daily_state_snapshot.activity_hint,
          activity_type: activity.activity_type,
          mood: activity.daily_state_snapshot.mood,
        }
      : null,
    companion: {
      appearance: companion?.appearance ?? null,
      gender: companion?.gender ?? null,
      name: companion?.name ?? "the companion",
      personality: companion?.personality ?? null,
      relationship_role: companion?.relationship_role ?? null,
    },
    scene: {
      mood: scene?.mood ?? "private conversation",
      name: scene?.name ?? "Private chat",
      tags: parseSceneTags(scene?.tags ?? null),
    },
    stage,
    timeSlot: computeTimeSlot(new Date(), timezone),
  };
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
  const outfit = await loadOutfitByJob(env, jobId);
  if (!outfit || outfit.user_id !== user.id) {
    return notFound();
  }
  const job = await loadBaseArtJob(env, jobId);
  const reconciled = job ? await reconcileOutfitFromJob(env, outfit, job) : outfit;

  return jsonResponse({
    error_code: job?.error_code ?? undefined,
    error_message: job?.error_message ?? undefined,
    job_id: jobId,
    output_key: reconciled.output_key ?? undefined,
    status: reconciled.status,
  });
}
