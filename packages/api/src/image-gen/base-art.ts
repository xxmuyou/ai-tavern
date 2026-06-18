import { resolveImageGenConfig } from "../settings/store";
import { parseGenerationParamValues, type ImageGenerationParamValues } from "./generation-params";
import {
  ImageGenError,
  getImageGenProvider,
  resolveImageLoraSelection,
  type ImageGenProvider,
  type ImageGenRequest,
} from "./index";
import {
  PORTRAIT_CREATE_LORA_WORKFLOW_KEY,
  PORTRAIT_CREATE_WORKFLOW_KEY,
  normalizeWorkflowKey,
} from "./workflow-keys";
import {
  CreditsError,
  TASK_CREDIT_COST,
  commitReservation,
  releaseReservation,
  reserveCredits,
} from "../credits";

/**
 * Companion base-art draft pipeline (spec-022 portrait_create).
 *
 * The base portrait is generated BEFORE any companion exists, so it cannot
 * live in companion_art_jobs. It uses the generic image_generation_jobs table
 * (spec-020 §C). On success the image is written to R2 under a user-scoped
 * key and the job carries that key so the create form can pick it up.
 */

export type BaseArtSource = "text" | "upload";

export type ImageGenJobStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ImageGenJobRow = {
  id: string;
  user_id: string | null;
  task: string;
  mode: string;
  status: ImageGenJobStatus;
  style: string | null;
  workflow_key: string | null;
  provider: string | null;
  model: string | null;
  prompt: string;
  negative_prompt: string | null;
  ckpt_name: string | null;
  checkpoint_field_name: string | null;
  lora_id: string | null;
  lora_name: string | null;
  lora_model_strength: number | null;
  lora_clip_strength: number | null;
  generation_params_json: string | null;
  input_keys: string | null;
  mask_key: string | null;
  output_prefix: string;
  output_key: string | null;
  output_content_type: string | null;
  provider_task_id: string | null;
  provider_submitted_at: number | null;
  provider_last_polled_at: number | null;
  provider_result_received_at: number | null;
  provider_task_cost_time_ms: number | null;
  provider_consume_coins: number | null;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  billing_ref: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
};

export type BaseArtQueuePayload = {
  type: "image.generate";
  job_id: string;
  created_at: string;
};

export const RUNNINGHUB_QUEUE_WAIT_CODE = "provider_queue_wait";
export const RUNNINGHUB_QUEUE_STATUS_LABEL = "Queued";
export const RUNNINGHUB_QUEUE_REASON = "provider_capacity";
export const RUNNINGHUB_CAPACITY_ERROR_CODE = "provider_capacity";

const RUNNINGHUB_QUEUE_MAX_WAIT_MS = 15 * 60 * 1000;
export type RunningHubCapacityDelayResult = "continue" | "queued" | "timed_out";

const TASK_BASE_ART = "companion_base_art";
const OUTPUT_PREFIX = "companion-base-art";
// Subject anchor only — background/framing stay under the user's control. The
// old clean-background wording drowned out the (untranslated) user prompt and
// produced empty-background images.
const PORTRAIT_CREATE_SUBJECT_PROMPT =
  "solo, 1 character, centered composition, full face visible, detailed face, detailed eyes";

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type CreateBaseArtJobInput = {
  userId: string;
  source: BaseArtSource;
  workflowKey: string;
  modelId?: string;
  prompt?: string;
  uploadKey?: string;
  ckptName?: string;
  checkpointFieldName?: string | null;
  loraId?: string | null;
  generationParams?: ImageGenerationParamValues | null;
  /** Credit reservation id to settle when the job reaches a terminal state (spec-021 §F). */
  billingRef?: string | null;
};

/**
 * Reserves credits for one image generation (spec-021 §F). Returns the
 * reservation id to store on the job's `billing_ref`; callers surface a 402 when
 * funds are insufficient and skip job creation. Settlement (commit on success /
 * release on failure) happens at the job's terminal state in
 * completeImageJobWithImage / failImageJob, keyed by `billing_ref`.
 */
export async function reserveImageGenerationCredits(
  env: Env,
  userId: string,
): Promise<{ ok: true; reservationId: string } | { ok: false }> {
  try {
    const reservation = await reserveCredits(env, {
      amount: TASK_CREDIT_COST.image_generation,
      referenceId: crypto.randomUUID(),
      referenceType: "image_job",
      taskType: "image_generation",
      userId,
    });
    return { ok: true, reservationId: reservation.reservation_id };
  } catch (err) {
    if (err instanceof CreditsError && err.code === "credits_insufficient") {
      return { ok: false };
    }
    throw err;
  }
}

export async function createBaseArtJob(
  env: Env,
  input: CreateBaseArtJobInput,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const workflowKey = normalizeWorkflowKey(input.workflowKey) || PORTRAIT_CREATE_WORKFLOW_KEY;
  const mode = input.source === "upload" ? "image_to_image" : "text_to_image";
  const inputKeys = input.source === "upload" && input.uploadKey ? JSON.stringify([input.uploadKey]) : null;
  const loraSelection = input.loraId
    ? await resolveLoraForJob(env, {
        loraId: input.loraId,
        modelId: input.modelId,
        workflowKey,
      })
    : null;

  await env.DB.prepare(
    `INSERT INTO image_generation_jobs
       (id, user_id, task, mode, status, workflow_key, prompt, ckpt_name, checkpoint_field_name,
        lora_id, lora_name, lora_model_strength, lora_clip_strength,
        generation_params_json, input_keys, output_prefix, billing_ref, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.userId,
      TASK_BASE_ART,
      mode,
      workflowKey,
      input.prompt ?? "",
      input.ckptName ?? null,
      input.checkpointFieldName ?? null,
      loraSelection?.id ?? null,
      loraSelection?.lora_name ?? null,
      loraSelection?.model_strength ?? null,
      loraSelection?.clip_strength ?? null,
      input.generationParams ? JSON.stringify(input.generationParams) : null,
      inputKeys,
      OUTPUT_PREFIX,
      input.billingRef ?? null,
      now,
      now,
    )
    .run();

  const payload: BaseArtQueuePayload = {
    created_at: new Date(now).toISOString(),
    job_id: id,
    type: "image.generate",
  };
  await env.JOB_QUEUE.send(payload);

  return id;
}

export async function loadBaseArtJob(env: Env, jobId: string): Promise<ImageGenJobRow | null> {
  return env.DB.prepare(`SELECT * FROM image_generation_jobs WHERE id = ?`)
    .bind(jobId)
    .first<ImageGenJobRow>();
}

export async function getImageJobByProviderTaskId(
  env: Env,
  providerTaskId: string,
): Promise<ImageGenJobRow | null> {
  return env.DB.prepare(
    `SELECT * FROM image_generation_jobs
     WHERE provider_task_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
  )
    .bind(providerTaskId)
    .first<ImageGenJobRow>();
}

export async function listStaleImageJobs(
  env: Env,
  beforeUpdatedAt: number,
  beforeProviderPollAt = beforeUpdatedAt,
  hardTimeoutBeforeUpdatedAt = beforeUpdatedAt,
  limit = 20,
): Promise<ImageGenJobRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM image_generation_jobs
     WHERE status = 'processing'
       AND provider_task_id IS NOT NULL
       AND updated_at < ?
       AND (
         updated_at < ?
         OR provider_last_polled_at IS NULL
         OR provider_last_polled_at < ?
       )
     ORDER BY updated_at ASC
     LIMIT ?`,
  )
    .bind(beforeUpdatedAt, hardTimeoutBeforeUpdatedAt, beforeProviderPollAt, limit)
    .all<ImageGenJobRow>();
  return results ?? [];
}

/**
 * Jobs stuck before a provider task was created. They may still be `pending`,
 * or `processing` after a dependent job (for example a cutout) left them waiting
 * without a RunningHub task id. Cron re-enqueues them once so the UI does not
 * spin forever on an orphaned job.
 */
export async function listStalePendingImageJobs(
  env: Env,
  beforeUpdatedAt: number,
  limit = 20,
): Promise<ImageGenJobRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM image_generation_jobs
     WHERE status IN ('pending', 'processing')
       AND provider_task_id IS NULL
       AND updated_at < ?
     ORDER BY updated_at ASC
     LIMIT ?`,
  )
    .bind(beforeUpdatedAt, limit)
    .all<ImageGenJobRow>();
  return results ?? [];
}

/** Re-send the queue message for an existing image_generation_jobs row. */
export async function reenqueueImageJob(
  env: Env,
  jobId: string,
  delaySeconds?: number,
): Promise<void> {
  const payload: BaseArtQueuePayload = {
    created_at: new Date().toISOString(),
    job_id: jobId,
    type: "image.generate",
  };
  await env.JOB_QUEUE.send(
    payload,
    delaySeconds && delaySeconds > 0 ? { delaySeconds } : undefined,
  );
}

type UpdateImageJobInput = {
  status?: ImageGenJobStatus;
  provider?: string | null;
  model?: string | null;
  provider_task_id?: string | null;
  provider_submitted_at?: number | null;
  provider_result_received_at?: number | null;
  provider_task_cost_time_ms?: number | null;
  provider_consume_coins?: number | null;
  output_key?: string | null;
  output_content_type?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  retry_count?: number;
  completed_at?: number | null;
};

export async function updateImageJob(
  env: Env,
  jobId: string,
  patch: UpdateImageJobInput,
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) return;
  fields.push(`updated_at = ?`);
  values.push(Date.now());
  values.push(jobId);
  await env.DB.prepare(
    `UPDATE image_generation_jobs SET ${fields.join(", ")} WHERE id = ?`,
  )
    .bind(...values)
    .run();
}

export async function markImageJobProviderPolled(
  env: Env,
  jobId: string,
  timestamp: number,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE image_generation_jobs SET provider_last_polled_at = ? WHERE id = ?`,
  )
    .bind(timestamp, jobId)
    .run();
}

export function getImageJobQueueStatus(job: {
  error_code?: string | null;
  status?: string | null;
}): { queue_reason: typeof RUNNINGHUB_QUEUE_REASON; status_label: typeof RUNNINGHUB_QUEUE_STATUS_LABEL } | null {
  const terminal = job.status === "succeeded" || job.status === "failed" || job.status === "cancelled";
  if (terminal || job.error_code !== RUNNINGHUB_QUEUE_WAIT_CODE) return null;
  return {
    queue_reason: RUNNINGHUB_QUEUE_REASON,
    status_label: RUNNINGHUB_QUEUE_STATUS_LABEL,
  };
}

export function isRunningHubCapacityError(err: unknown): boolean {
  return err instanceof ImageGenError && err.code === RUNNINGHUB_CAPACITY_ERROR_CODE;
}

export async function maybeDelayRunningHubImageJob(
  env: Env,
  job: ImageGenJobRow,
  provider: ImageGenProvider,
): Promise<RunningHubCapacityDelayResult> {
  if (provider.name !== "runninghub") return "continue";

  const cfg = await resolveImageGenConfig(env);
  const active = await countActiveRunningHubTasks(env);
  if (active < cfg.runninghubMaxActiveTasks) return "continue";

  return delayRunningHubImageJob(env, job);
}

export async function maybeDelayRunningHubCapacityError(
  env: Env,
  job: ImageGenJobRow,
  err: unknown,
): Promise<RunningHubCapacityDelayResult> {
  if (!isRunningHubCapacityError(err)) return "continue";
  return delayRunningHubImageJob(env, job);
}

async function countActiveRunningHubTasks(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM image_generation_jobs
     WHERE provider = 'runninghub'
       AND status = 'processing'
       AND provider_task_id IS NOT NULL`,
  ).first<{ count: number }>();
  const count = Number(row?.count ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function delayRunningHubImageJob(
  env: Env,
  job: ImageGenJobRow,
): Promise<Exclude<RunningHubCapacityDelayResult, "continue">> {
  const now = Date.now();
  if (now - job.created_at > RUNNINGHUB_QUEUE_MAX_WAIT_MS) {
    await failImageJob(
      env,
      job,
      "provider_capacity_timeout",
      "RunningHub capacity queue exceeded 15 minutes",
    );
    return "timed_out";
  }

  const retryCount = (job.retry_count ?? 0) + 1;
  const delaySeconds = Math.min(60, retryCount * 10);
  await updateImageJob(env, job.id, {
    error_code: RUNNINGHUB_QUEUE_WAIT_CODE,
    error_message: RUNNINGHUB_QUEUE_STATUS_LABEL,
    provider: "runninghub",
    retry_count: retryCount,
    status: "processing",
  });
  await reenqueueImageJob(env, job.id, delaySeconds);
  return "queued";
}

export async function failImageJob(
  env: Env,
  job: ImageGenJobRow,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  await updateImageJob(env, job.id, {
    completed_at: Date.now(),
    error_code: errorCode,
    error_message: errorMessage.slice(0, 1000),
    status: "failed",
  });
  // Release the credit reservation so the user isn't charged for a failed image.
  // releaseReservation is idempotent, so duplicate terminal paths are safe.
  if (job.billing_ref) {
    await releaseReservation(env, job.billing_ref, errorCode);
  }
}

export async function completeImageJobWithImage(
  env: Env,
  job: ImageGenJobRow,
  input: { bytes: Uint8Array; contentType: string; provider: string; model: string },
): Promise<string> {
  if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
    return job.output_key ?? "";
  }

  const ext = CONTENT_TYPE_EXTENSIONS[input.contentType] ?? "webp";
  const owner = job.user_id ?? "anonymous";
  // The path segment comes from the job's output_prefix so each task type
  // (companion-base-art, chat-moments, …) lands in its own R2 folder while
  // sharing this single completion path (also used by RunningHub webhook/poll).
  const prefix = job.output_prefix || "base-art";
  const outputKey = `user-art/${owner}/${prefix}/${crypto.randomUUID()}.${ext}`;

  await env.ASSETS.put(outputKey, input.bytes, {
    customMetadata: {
      job_id: job.id,
      provider: input.provider,
      source: job.task,
    },
    httpMetadata: { contentType: input.contentType },
  });
  await env.DB.prepare(
    "INSERT OR REPLACE INTO asset_objects (key, content_type, size_bytes) VALUES (?, ?, ?)",
  )
    .bind(outputKey, input.contentType, input.bytes.byteLength)
    .run();

  await updateImageJob(env, job.id, {
    completed_at: Date.now(),
    error_code: null,
    error_message: null,
    model: input.model,
    output_content_type: input.contentType,
    output_key: outputKey,
    provider: input.provider,
    status: "succeeded",
  });

  // Commit the credit reservation now that the image was produced.
  // commitReservation is idempotent against the same reservation id.
  if (job.billing_ref) {
    await commitReservation(env, job.billing_ref);
  }

  return outputKey;
}

export async function processBaseArtJob(env: Env, jobId: string): Promise<void> {
  const job = await loadBaseArtJob(env, jobId);
  if (!job) return;
  if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
    return;
  }

  await updateImageJob(env, job.id, { status: "processing" });

  try {
    const sourceArtUrl = parseFirstInputKey(job.input_keys);
    const cfg = await resolveImageGenConfig(env);
    const workflowKey = normalizeWorkflowKey(job.workflow_key) || PORTRAIT_CREATE_WORKFLOW_KEY;
    // The global portrait create base prompt is a portrait style/quality preamble; only
    // prepend it for portrait_create so other workflows aren't
    // polluted with portrait-specific styling.
    const basePrompt = workflowKey === PORTRAIT_CREATE_WORKFLOW_KEY || workflowKey === PORTRAIT_CREATE_LORA_WORKFLOW_KEY
      ? [cfg.portraitCreateBasePrompt?.trim(), PORTRAIT_CREATE_SUBJECT_PROMPT].filter(Boolean).join("\n")
      : undefined;
    const request: ImageGenRequest = {
      mode: "create",
      prompt: basePrompt ? `${basePrompt}\n\n${job.prompt}` : job.prompt,
      source_art_url: sourceArtUrl ?? undefined,
      workflow_key: workflowKey,
      ckpt_name: job.ckpt_name ?? undefined,
      checkpoint_field_name: job.checkpoint_field_name ?? undefined,
      lora_clip_strength: job.lora_clip_strength,
      lora_id: job.lora_id ?? undefined,
      lora_model_strength: job.lora_model_strength ?? undefined,
      lora_name: job.lora_name ?? undefined,
      generation_params: parseGenerationParamValues(job.generation_params_json),
    };
    const provider = await getImageGenProvider(env, "create", request.workflow_key);
    if ((await maybeDelayRunningHubImageJob(env, job, provider)) !== "continue") {
      return;
    }
    const response = await provider.generate(request, env);

    if (response.type === "pending") {
      await updateImageJob(env, job.id, {
        error_code: null,
        error_message: null,
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
    if ((await maybeDelayRunningHubCapacityError(env, job, err)) !== "continue") {
      return;
    }
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

async function resolveLoraForJob(
  env: Env,
  input: { workflowKey: string; modelId?: string; loraId: string },
) {
  if (!input.modelId) {
    throw new ImageGenError(
      "invalid_model_lora_combination",
      "LoRA selection requires a workflow/checkpoint model binding",
      { retryable: false },
    );
  }
  const selection = await resolveImageLoraSelection(env, {
    loraId: input.loraId,
    modelId: input.modelId,
    workflowKey: input.workflowKey,
  });
  if (!selection) {
    throw new ImageGenError(
      "invalid_model_lora_combination",
      `LoRA ${input.loraId} is not allowed for ${input.workflowKey}::${input.modelId}`,
      { retryable: false },
    );
  }
  return selection;
}

export function isBaseArtJobPayload(value: unknown): value is BaseArtQueuePayload {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return obj.type === "image.generate" && typeof obj.job_id === "string";
}

function parseFirstInputKey(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && typeof arr[0] === "string" && arr[0]) return arr[0];
  } catch {
    return null;
  }
  return null;
}
