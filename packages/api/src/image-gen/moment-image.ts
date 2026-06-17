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
import {
  createOrReuseCutoutJob,
  loadCompanionCutoutSource,
} from "./cutout";
import { CHAT_MOMENT_WORKFLOW_KEY } from "./workflow-keys";
import type { MomentVisualAction } from "./moment-action";
import {
  classifyMomentVenue,
  presetMomentStyle,
  resolveMomentStyleProfile,
  stageStyleTier,
  suggestMomentCameraOptions,
  suggestMomentExpressionOptions,
  suggestMomentPoseOptions,
  type MomentScenePrivacy,
  type MomentVenue,
} from "./moment-style";

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
export const MOMENT_WORKFLOW_KEY = CHAT_MOMENT_WORKFLOW_KEY;
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
// Prompt building
// -----------------------------------------------------------------------------

export type MomentPromptContext = {
  companion: {
    id: string;
    name: string;
    gender: string | null;
    personality: string | null;
    relationship_role: string | null;
  };
  scene: { name: string; mood: string; tags: string[] };
  /** public scenes allow distant blurred passersby; private scenes stay empty. */
  privacy: MomentScenePrivacy;
  timeSlot: string;
  stage: RelationshipStage;
  emotion: string | null;
  /** Companion reply this moment is captured from (raw content). */
  sourceReply: string;
  /** Text the user said just before the companion reply. */
  previousUserText: string | null;
  /** Sanitized single-companion visual action from the current turn. */
  visualAction?: MomentVisualAction | null;
  activity: { activity_type: string; activity_hint: string; mood: string } | null;
  storyBeat: { title: string; objective: string } | null;
};

function resolveMomentVenue(ctx: MomentPromptContext): MomentVenue {
  return classifyMomentVenue(ctx.scene.name, ctx.scene.tags, ctx.privacy);
}

function presetFallbackAction(ctx: MomentPromptContext): MomentVisualAction {
  const venue = resolveMomentVenue(ctx);
  const style = presetMomentStyle(
    venue,
    stageStyleTier(ctx.stage),
    ctx.companion.gender,
    resolveMomentStyleProfile(ctx.companion.id, ctx.companion.gender),
  );
  const pose = suggestMomentPoseOptions(venue, ctx.companion.gender)[0]?.bodyPose
    ?? "standing three-quarter pose, face toward viewer";
  const cameraView = suggestMomentCameraOptions(venue, ctx.privacy)[0]?.cameraView
    ?? "front three-quarter view, medium angled shot";
  const expression = suggestMomentExpressionOptions(ctx.emotion, ctx.companion.gender)[0]?.expression
    ?? "calm attentive expression, clear eyes, relaxed brows, natural mouth";
  return {
    body_pose: pose,
    camera_view: cameraView,
    expression,
    hairstyle: style.hairstyle,
    ...(style.makeup ? { makeup: style.makeup } : {}),
    outfit: style.outfit,
  };
}

// The restyle is the whole point of the moment image (spec-027): even when the
// extractor succeeded but under-delivered, missing visual details fall back to
// the controlled venue/stage/emotion candidates so the look still changes from
// the reference without returning to vague generic prompt text.
function ensureRestyle(
  action: MomentVisualAction,
  ctx: MomentPromptContext,
): MomentVisualAction {
  const style = presetMomentStyle(
    resolveMomentVenue(ctx),
    stageStyleTier(ctx.stage),
    ctx.companion.gender,
    resolveMomentStyleProfile(ctx.companion.id, ctx.companion.gender),
  );
  const expression = suggestMomentExpressionOptions(ctx.emotion, ctx.companion.gender)[0]?.expression
    ?? "calm attentive expression, clear eyes, relaxed brows, natural mouth";
  const cameraView = suggestMomentCameraOptions(resolveMomentVenue(ctx), ctx.privacy)[0]?.cameraView
    ?? "front three-quarter view, medium angled shot";
  return {
    ...action,
    camera_view: action.camera_view?.trim() ? action.camera_view : cameraView,
    expression: action.expression?.trim() ? action.expression : expression,
    hairstyle: action.hairstyle?.trim() ? action.hairstyle : style.hairstyle,
    outfit: action.outfit?.trim() ? action.outfit : style.outfit,
  };
}

function pushMomentPoseLines(lines: string[], action: MomentVisualAction): void {
  lines.push(`Change the reference pose to: ${action.body_pose}. Do not keep the original portrait pose.`);
  if (action.camera_view?.trim()) {
    lines.push(`Camera view: ${action.camera_view.trim()}. Keep the face visible and recognizable.`);
  }

  const propLine = renderPropLine(action);
  if (propLine) {
    lines.push(propLine);
  }
  if (action.outfit?.trim()) {
    lines.push(
      `Outfit (overrides any clothing mentioned in the reference): ${action.outfit.trim()}.`,
    );
  }
  if (action.hairstyle?.trim()) {
    lines.push(`Change the hairstyle to: ${action.hairstyle.trim()}.`);
  }
  if (action.makeup?.trim()) {
    lines.push(`Makeup: ${action.makeup.trim()}.`);
  }
  if (action.expression?.trim()) {
    lines.push(`Expression: ${action.expression.trim()}.`);
  }
}

function renderPropLine(action: MomentVisualAction): string | null {
  const propName = action.prop_name?.trim();
  if (!propName) return null;
  if (action.prop_state === "held_one_hand") {
    return `Prop: one ${propName} held in one hand. Other hand relaxed and visible.`;
  }
  if (action.prop_state === "near_lips") {
    return `Prop: one ${propName} close to the lips, held in one hand. Other hand relaxed and visible.`;
  }
  if (action.prop_state === "just_set_down") {
    return `Prop: one ${propName} just set nearby in the scene, not held. Hands relaxed and natural.`;
  }
  return `Prop: one ${propName} nearby in the scene, not held. Hands relaxed and natural.`;
}

export function buildMomentPrompt(ctx: MomentPromptContext): string {
  const { companion, scene } = ctx;
  const lines: string[] = [];

  // This prompt drives a Qwen-Image-Edit "instruct" pipeline (FireRed-Image-Edit
  // base + Qwen-Edit Lightning LoRAs) that runs at cfg=1. At cfg=1 the negative
  // conditioning is mathematically inert — the workflow's negative node does
  // nothing — so EVERY single-subject / no-extra-people / no-camera guard has to
  // live here in the positive instruction. The model is a faithful image editor,
  // not a caption-driven generator: it must read as a short, imperative edit of
  // the companion's reference image. The old verbose, multi-paragraph form (plus
  // free-form user/story text) was what summoned background crowds.
  // Public scenes relax the absolute "no other people" rule to distant blurred
  // passersby for realism; private scenes keep the original strict wording.
  const isPublic = ctx.privacy === "public";
  lines.push(
    "Edit the input image into a single-character scene image of the same companion.",
    "Keep only this person's facial identity: the same recognizable face and facial features as the input image. The hairstyle, outfit, expression, body pose, and camera framing may all change to match the new scene.",
    isPublic
      ? "Keep exactly one person in focus — this companion only. Do not add a second main subject, the user, an opponent, or anyone near the companion; no duplicate bodies."
      : "Keep exactly one person in the image — this companion only. Do not add any other people, a second person, the user, an opponent, a crowd, bystanders, reflections of another person, or duplicate bodies.",
    "The companion's face remains visible and recognizable; the eyes may meet the viewer or lower softly to match the expression. Do not render any camera, phone, or photographic device.",
  );

  const momentPose = ensureRestyle(ctx.visualAction ?? presetFallbackAction(ctx), ctx);
  pushMomentPoseLines(lines, momentPose);

  // The companion's face is locked by the reference image the edit model holds,
  // not by text. We deliberately do NOT describe the face/appearance here: free-text
  // appearance mixes immutable identity with mutable hair/outfit and would drag the
  // old look back in, fighting the scene-driven restyle. Keep only a one-word gender
  // anchor to guard against gender drift under heavy pose/outfit changes.
  const gender = companion.gender?.trim();
  if (gender) {
    lines.push(`Companion gender: ${gender}.`);
  }

  const sceneTags = scene.tags.length ? `, ${scene.tags.join(", ")}` : "";
  lines.push(
    `Change the background to: ${scene.name}, ${ctx.timeSlot}, ${scene.mood} atmosphere${sceneTags}. ${
      isPublic
        ? "A few distant passersby may appear far behind, small and blurred, none near the companion, no other face in focus."
        : "The background is empty of other people."
    }`,
  );

  lines.push(
    isPublic
      ? "Single companion in focus, viewer/user not visible, natural composition, no crowd, no second main character, no one near the companion, no text, no UI, no speech bubbles, no visible camera or photographic device."
      : "Single companion only, viewer/user not visible, natural composition, no other people, no crowd, no second person, no extra characters, no text, no UI, no speech bubbles, no visible camera or photographic device.",
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
  /** Credit reservation id to settle when the job reaches a terminal state (spec-021 §F). */
  billingRef?: string | null;
};

async function insertImageJob(
  env: Env,
  jobId: string,
  userId: string,
  prompt: string,
  now: number,
  billingRef: string | null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO image_generation_jobs
       (id, user_id, task, mode, status, workflow_key, prompt, output_prefix, billing_ref, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(jobId, userId, TASK_MOMENT_IMAGE, MODE_COLUMN, MOMENT_WORKFLOW_KEY, prompt, OUTPUT_PREFIX, billingRef, now, now)
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

  await insertImageJob(env, jobId, input.userId, input.promptSnapshot, now, input.billingRef ?? null);

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
  billingRef: string | null = null,
): Promise<{ jobId: string; momentId: string }> {
  const now = Date.now();
  const jobId = crypto.randomUUID();

  await insertImageJob(env, jobId, moment.user_id, promptSnapshot, now, billingRef);
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
    // Feed the companion's base portrait as the chat_moment load-image reference so the
    // scene character stays consistent. When it's missing, omit source_art_url and
    // fall back to txt2img (the provider routes create+source_art_url to img2img).
    const moment = await loadMomentByJob(env, job.id);
    const sourceArtUrl = moment ? await resolveMomentSourceArt(env, job, moment) : null;
    if (sourceArtUrl === "waiting_for_cutout") {
      return;
    }
    const basePrompt = (await resolveImageGenConfig(env)).chatMomentBasePrompt?.trim();
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
        provider_submitted_at: Date.now(),
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

async function resolveMomentSourceArt(
  env: Env,
  job: ImageGenJobRow,
  moment: StoryMomentImageRow,
): Promise<string | null | "waiting_for_cutout"> {
  const source = await loadCompanionCutoutSource(env, moment.companion_id, job.user_id ?? moment.user_id);
  if (!source?.art_url) return null;
  if (source.art_cutout_key) return source.art_cutout_key;

  const cutout = await createOrReuseCutoutJob(env, {
    companionId: moment.companion_id,
    sourceArtUrl: source.art_url,
    userId: job.user_id ?? moment.user_id,
  });
  if (cutout.status === "succeeded" && cutout.output_key) return cutout.output_key;
  if (cutout.status === "failed" || cutout.status === "cancelled") {
    throw new ImageGenError(
      "cutout_failed",
      cutout.error_message ?? "Companion cutout failed before moment image generation",
      { retryable: false },
    );
  }

  await updateImageJob(env, job.id, {
    provider_task_id: null,
    status: "processing",
  });
  return "waiting_for_cutout";
}

export async function reenqueueMomentJobsForCompanion(
  env: Env,
  companionId: string,
): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT j.id
     FROM image_generation_jobs j
     JOIN story_moment_images m ON m.job_id = j.id
     WHERE m.companion_id = ?
       AND j.task = ?
       AND j.status IN ('pending', 'processing')
       AND j.provider_task_id IS NULL
       AND j.output_key IS NULL
     ORDER BY j.created_at ASC
     LIMIT 20`,
  )
    .bind(companionId, TASK_MOMENT_IMAGE)
    .all<{ id: string }>();

  for (const row of results ?? []) {
    await env.JOB_QUEUE.send({
      created_at: new Date().toISOString(),
      job_id: row.id,
      type: "image.generate",
    });
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
