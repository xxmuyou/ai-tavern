import type { RelationshipStage } from "../life/types";
import {
  ImageGenError,
  getImageGenProvider,
  type ImageGenRequest,
} from "./index";
import {
  completeImageJobWithImage,
  failImageJob,
  loadBaseArtJob,
  updateImageJob,
  type ImageGenJobRow,
  type ImageGenJobStatus,
} from "./base-art";
import { resolveImageGenConfig } from "../settings/store";

/**
 * Chat moment image pipeline (spec-027).
 *
 * Captures a single "this just happened" image from a companion reply. When
 * scene context is present it becomes a full-scene image; otherwise it falls
 * back to a private-chat moment. Runs through the generic
 * image_generation_jobs queue (task = chat_moment_image, create mode) and is
 * pinned back to the source message via story_moment_images.
 */

export const TASK_MOMENT_IMAGE = "chat_moment_image";
export const MOMENT_WORKFLOW_KEY = "wf_moment";
const OUTPUT_PREFIX = "chat-moments";
const MODE_COLUMN = "text_to_image";

export type StoryMomentImageRow = {
  id: string;
  user_id: string;
  companion_id: string;
  thread_id: string;
  message_id: string;
  scene_id: string | null;
  activity_id: string | null;
  story_beat_id: string | null;
  emotion: string | null;
  prompt_snapshot: string;
  job_id: string;
  output_key: string | null;
  status: string;
  created_at: number;
  updated_at: number;
};

// -----------------------------------------------------------------------------
// Prompt building (rule-based, no extra LLM call)
// -----------------------------------------------------------------------------

export type MomentPromptContext = {
  companion: {
    name: string;
    gender: string | null;
    appearance: string | null;
    personality: string | null;
    relationship_role: string | null;
  };
  scene: { name: string; mood: string; tags: string[] };
  timeSlot: string;
  stage: RelationshipStage;
  emotion: string | null;
  /** Companion reply this moment is captured from (raw content). */
  sourceReply: string;
  /** Text the user said just before the companion reply. */
  previousUserText: string | null;
  activity: { activity_type: string; activity_hint: string; mood: string } | null;
  storyBeat: { title: string; objective: string } | null;
};

/** Extract scene/action description from a companion reply. */
export function extractNarration(content: string): string {
  const tagged = [...content.matchAll(/<narration>([\s\S]*?)<\/narration>/gi)]
    .map((m) => m[1]?.trim() ?? "")
    .filter(Boolean);
  if (tagged.length > 0) return tagged.join(" ");
  const italic = [...content.matchAll(/\*([^*]+)\*/g)]
    .map((m) => m[1]?.trim() ?? "")
    .filter(Boolean);
  if (italic.length > 0) return italic.join(" ");
  // No explicit narration — fall back to a short slice of the reply.
  return content.replace(/<\/?[a-z]+>/gi, "").trim().slice(0, 240);
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function buildMomentPrompt(ctx: MomentPromptContext): string {
  const { companion, scene } = ctx;
  const lines: string[] = [];

  lines.push(
    "Create a cinematic single-character scene image centered on the companion.",
    "Only one visible person: the companion. Do not show the user, an opponent, a second character, a crowd, reflections of another person, or duplicate bodies.",
    "The companion faces the camera with both eyes looking directly at the viewer.",
    "Use the scene as background/environment only.",
  );

  const companionBits = [
    companion.appearance?.trim(),
    companion.personality?.trim(),
  ].filter(Boolean);
  const genderHint = companion.gender ? ` (${companion.gender})` : "";
  lines.push(
    `Companion: ${companion.name}${genderHint}${companionBits.length ? `, ${companionBits.join(", ")}` : ""}.`,
  );

  if (companion.relationship_role?.trim()) {
    lines.push(`Relationship context: ${companion.relationship_role.trim()}.`);
  }

  const sceneTags = scene.tags.length ? `, ${scene.tags.join(", ")}` : "";
  lines.push(`Scene: ${scene.name}, ${ctx.timeSlot}, ${scene.mood} atmosphere${sceneTags}.`);

  const action = extractNarration(ctx.sourceReply);
  if (ctx.previousUserText) {
    lines.push(`Recent off-camera context: "${truncate(ctx.previousUserText, 160)}".`);
  }
  if (action) {
    lines.push(`In this moment: ${truncate(action, 240)}`);
  }

  if (ctx.emotion) {
    lines.push(`Emotional state: ${ctx.emotion}.`);
  }

  lines.push(
    `Relationship stage: ${ctx.stage}; keep the body language and intimacy consistent with this stage.`,
  );

  if (ctx.activity) {
    const activityBits = [ctx.activity.activity_type, ctx.activity.activity_hint, ctx.activity.mood]
      .map((b) => b?.trim())
      .filter(Boolean);
    if (activityBits.length) {
      lines.push(`Activity context: ${activityBits.join(", ")}.`);
    }
  }

  if (ctx.storyBeat) {
    lines.push(
      `Story objective (do not spoil unfinished beats): ${ctx.storyBeat.title} — ${truncate(ctx.storyBeat.objective, 160)}`,
    );
  }

  lines.push(
    "Single companion in environment, natural composition, no text, no UI, no speech bubbles, no extra characters.",
  );

  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// Persistence
// -----------------------------------------------------------------------------

export async function loadMomentByMessage(
  env: Env,
  userId: string,
  messageId: string,
): Promise<StoryMomentImageRow | null> {
  return env.DB.prepare(
    `SELECT * FROM story_moment_images WHERE user_id = ? AND message_id = ?`,
  )
    .bind(userId, messageId)
    .first<StoryMomentImageRow>();
}

export async function loadMomentByJob(
  env: Env,
  jobId: string,
): Promise<StoryMomentImageRow | null> {
  return env.DB.prepare(`SELECT * FROM story_moment_images WHERE job_id = ?`)
    .bind(jobId)
    .first<StoryMomentImageRow>();
}

/**
 * Base portrait (R2 object key) for a companion. Fed as the wf_moment
 * load-image reference so the scene's character matches the companion's
 * 立绘. Returns null when the companion has no base art (graceful txt2img
 * fallback in processMomentImageJob).
 */
async function loadCompanionArtUrl(env: Env, companionId: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT art_url FROM companions WHERE id = ?`)
    .bind(companionId)
    .first<{ art_url: string | null }>();
  return row?.art_url ?? null;
}

export type CreateMomentImageInput = {
  userId: string;
  companionId: string;
  threadId: string;
  messageId: string;
  sceneId: string | null;
  activityId: string | null;
  storyBeatId: string | null;
  emotion: string | null;
  promptSnapshot: string;
};

async function insertImageJob(
  env: Env,
  jobId: string,
  userId: string,
  prompt: string,
  now: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO image_generation_jobs
       (id, user_id, task, mode, status, workflow_key, prompt, output_prefix, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
  )
    .bind(jobId, userId, TASK_MOMENT_IMAGE, MODE_COLUMN, MOMENT_WORKFLOW_KEY, prompt, OUTPUT_PREFIX, now, now)
    .run();
}

async function enqueue(env: Env, jobId: string, now: number): Promise<void> {
  await env.JOB_QUEUE.send({
    created_at: new Date(now).toISOString(),
    job_id: jobId,
    type: "image.generate",
  });
}

/** Create a fresh job + moment row and enqueue it. */
export async function createMomentImageJob(
  env: Env,
  input: CreateMomentImageInput,
): Promise<{ jobId: string; momentId: string }> {
  const now = Date.now();
  const jobId = crypto.randomUUID();
  const momentId = crypto.randomUUID();

  await insertImageJob(env, jobId, input.userId, input.promptSnapshot, now);

  // The job row is inserted first; if linking the moment row or enqueueing then
  // fails, mark the job failed instead of leaving an orphaned `pending` job that
  // no consumer will ever pick up (the bug behind "Capture this moment" → always
  // "Try again"). Re-throw so the caller still surfaces the error to the client.
  try {
    await env.DB.prepare(
      `INSERT INTO story_moment_images
         (id, user_id, companion_id, thread_id, message_id, scene_id, activity_id,
          story_beat_id, emotion, prompt_snapshot, job_id, output_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'queued', ?, ?)`,
    )
      .bind(
        momentId,
        input.userId,
        input.companionId,
        input.threadId,
        input.messageId,
        input.sceneId,
        input.activityId,
        input.storyBeatId,
        input.emotion,
        input.promptSnapshot,
        jobId,
        now,
        now,
      )
      .run();

    await enqueue(env, jobId, now);
  } catch (err) {
    await updateImageJob(env, jobId, {
      completed_at: Date.now(),
      error_code: "moment_enqueue_failed",
      error_message: err instanceof Error ? err.message : String(err),
      status: "failed",
    });
    throw err;
  }

  return { jobId, momentId };
}

/** Re-run a failed moment: spin a new job for the same message and relink it. */
export async function regenerateMomentImageJob(
  env: Env,
  moment: StoryMomentImageRow,
  promptSnapshot: string,
): Promise<{ jobId: string; momentId: string }> {
  const now = Date.now();
  const jobId = crypto.randomUUID();

  await insertImageJob(env, jobId, moment.user_id, promptSnapshot, now);
  await env.DB.prepare(
    `UPDATE story_moment_images
        SET job_id = ?, prompt_snapshot = ?, output_key = NULL, status = 'queued', updated_at = ?
      WHERE id = ?`,
  )
    .bind(jobId, promptSnapshot, now, moment.id)
    .run();

  await enqueue(env, jobId, now);
  return { jobId, momentId: moment.id };
}

// -----------------------------------------------------------------------------
// Job processing + reconciliation
// -----------------------------------------------------------------------------

export async function processMomentImageJob(env: Env, jobId: string): Promise<void> {
  const job = await loadBaseArtJob(env, jobId);
  if (!job) return;
  if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
    return;
  }

  await updateImageJob(env, job.id, { status: "processing" });

  try {
    // Feed the companion's base 立绘 as the wf_moment load-image reference so the
    // scene character stays consistent. When it's missing, omit source_art_url and
    // fall back to txt2img (the provider routes create+source_art_url to img2img).
    const moment = await loadMomentByJob(env, job.id);
    const sourceArtUrl = moment ? await loadCompanionArtUrl(env, moment.companion_id) : null;
    const basePrompt = (await resolveImageGenConfig(env)).wfMomentBasePrompt?.trim();
    const request: ImageGenRequest = {
      mode: "create",
      prompt: basePrompt ? `${basePrompt}\n\n${job.prompt}` : job.prompt,
      workflow_key: job.workflow_key ?? MOMENT_WORKFLOW_KEY,
      ...(sourceArtUrl ? { source_art_url: sourceArtUrl } : {}),
    };
    const provider = await getImageGenProvider(env, "create", request.workflow_key);
    const response = await provider.generate(request, env);

    if (response.type === "pending") {
      await updateImageJob(env, job.id, {
        model: response.model,
        provider: response.provider,
        provider_task_id: response.external_task_id,
        status: "processing",
      });
      return;
    }

    await completeImageJobWithImage(env, job, {
      bytes: response.image_bytes,
      contentType: response.content_type,
      model: response.model,
      provider: response.provider,
    });
  } catch (err) {
    if (err instanceof ImageGenError && !err.retryable) {
      await failImageJob(env, job, err.code, err.message);
      return;
    }
    const code = err instanceof ImageGenError ? err.code : "provider_error";
    const message = err instanceof Error ? err.message : String(err);
    await failImageJob(env, job, code, message);
    throw err;
  }
}

const TERMINAL: ReadonlySet<ImageGenJobStatus> = new Set(["succeeded", "failed", "cancelled"]);

/**
 * Single completion path: the image pipeline only writes image_generation_jobs.
 * Lazily mirror the linked job's terminal status/output_key onto the moment row
 * when it has drifted, so reads stay consistent without a second write path.
 */
export async function reconcileMomentFromJob(
  env: Env,
  moment: StoryMomentImageRow,
  job: ImageGenJobRow,
): Promise<StoryMomentImageRow> {
  const jobTerminal = TERMINAL.has(job.status);
  const nextStatus = job.status;
  const nextOutputKey = job.output_key ?? null;
  const drifted =
    moment.status !== nextStatus ||
    (jobTerminal && moment.output_key !== nextOutputKey);
  if (!drifted) return moment;

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE story_moment_images SET status = ?, output_key = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(nextStatus, nextOutputKey, now, moment.id)
    .run();
  return { ...moment, output_key: nextOutputKey, status: nextStatus, updated_at: now };
}
