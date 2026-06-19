import {
  ImageGenError,
  getImageGenProvider,
  type ImageGenRequest,
} from "./index";
import {
  completeImageJobWithImage,
  failImageJob,
  loadBaseArtJob,
  maybeDelayRunningHubCapacityError,
  maybeDelayRunningHubImageJob,
  reenqueueImageJob,
  sendImageJob,
  updateImageJob,
  type ImageGenJobRow,
  type ImageGenJobStatus,
} from "./base-art";
import { checkSourceArtAvailable } from "./source-art";
import { COMPANION_CUTOUT_WORKFLOW_KEY } from "./workflow-keys";

export const TASK_CUTOUT = "companion_cutout";
export const CUTOUT_WORKFLOW_KEY = COMPANION_CUTOUT_WORKFLOW_KEY;

const OUTPUT_PREFIX = "companion-cutout";
const MODE_COLUMN = "cutout";

const TERMINAL: ReadonlySet<ImageGenJobStatus> = new Set(["succeeded", "failed", "cancelled"]);

export type CompanionCutoutJobRow = {
  id: string;
  companion_id: string;
  user_id: string | null;
  source_art_url: string;
  image_job_id: string;
  status: ImageGenJobStatus;
  output_key: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
};

export type CompanionCutoutSource = {
  art_url: string | null;
  art_cutout_key: string | null;
};

export async function loadCompanionCutoutSource(
  env: Env,
  companionId: string,
  userId: string | null = null,
): Promise<CompanionCutoutSource | null> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(p.art_key, c.art_url) AS art_url,
            CASE WHEN p.art_key IS NULL THEN c.art_cutout_key ELSE NULL END AS art_cutout_key
     FROM companions c
     LEFT JOIN companion_profile_images p
       ON p.companion_id = c.id AND p.user_id = ?
     WHERE c.id = ?`,
  )
    .bind(userId ?? "", companionId)
    .first<CompanionCutoutSource>();
  return row ?? null;
}

export async function createOrReuseCutoutJob(
  env: Env,
  input: { companionId: string; sourceArtUrl: string; userId: string | null },
): Promise<CompanionCutoutJobRow> {
  const available = await checkSourceArtAvailable(env, input.sourceArtUrl);
  if (!available.ok) {
    throw new ImageGenError(
      available.error,
      available.key
        ? `Source art is not available to image generation: ${available.key}`
        : "source_art_url missing or invalid",
      { retryable: false },
    );
  }

  const existing = await loadCutoutByCompanionAndSource(
    env,
    input.companionId,
    input.sourceArtUrl,
  );
  if (existing && existing.status !== "failed" && existing.status !== "cancelled") {
    return existing;
  }

  const now = Date.now();
  const imageJobId = crypto.randomUUID();
  await insertImageJob(env, imageJobId, input.userId, input.sourceArtUrl, now);

  if (existing) {
    await env.DB.prepare(
      `UPDATE companion_cutout_jobs
       SET image_job_id = ?, status = 'pending', output_key = NULL, error_code = NULL,
           error_message = NULL, completed_at = NULL, updated_at = ?
       WHERE id = ?`,
    )
      .bind(imageJobId, now, existing.id)
      .run();
    await enqueue(env, imageJobId, now);
    return loadCutoutById(env, existing.id) as Promise<CompanionCutoutJobRow>;
  }

  const cutoutId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO companion_cutout_jobs
       (id, companion_id, user_id, source_art_url, image_job_id, status,
        output_key, error_code, error_message, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?, NULL)`,
  )
    .bind(cutoutId, input.companionId, input.userId, input.sourceArtUrl, imageJobId, now, now)
    .run();

  await enqueue(env, imageJobId, now);
  return loadCutoutById(env, cutoutId) as Promise<CompanionCutoutJobRow>;
}

export async function loadCutoutByImageJob(
  env: Env,
  imageJobId: string,
): Promise<CompanionCutoutJobRow | null> {
  return env.DB.prepare(`SELECT * FROM companion_cutout_jobs WHERE image_job_id = ?`)
    .bind(imageJobId)
    .first<CompanionCutoutJobRow>();
}

export async function processCutoutJob(
  env: Env,
  jobId: string,
): Promise<{ companionId: string } | null> {
  const job = await loadBaseArtJob(env, jobId);
  if (!job) return null;
  if (TERMINAL.has(job.status)) return null;

  const cutout = await loadCutoutByImageJob(env, job.id);
  if (!cutout) {
    await failImageJob(env, job, "cutout_link_missing", "Cutout companion link is missing");
    return null;
  }

  await updateImageJob(env, job.id, { status: "processing" });
  await updateCutout(env, cutout.id, { status: "processing" });

  try {
    const request: ImageGenRequest = {
      mode: "cutout",
      prompt: "",
      source_art_url: cutout.source_art_url,
      workflow_key: job.workflow_key ?? CUTOUT_WORKFLOW_KEY,
    };
    const provider = await getImageGenProvider(env, "cutout", request.workflow_key);
    const capacityDelay = await maybeDelayRunningHubImageJob(env, job, provider);
    if (capacityDelay !== "continue") {
      if (capacityDelay === "timed_out") {
        const failed = await loadBaseArtJob(env, job.id);
        if (failed) await syncCutoutFromImageJob(env, failed);
      }
      return null;
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
      return null;
    }

    await completeImageJobWithImage(env, job, {
      bytes: response.image_bytes,
      contentType: response.content_type,
      model: response.model,
      provider: response.provider,
    });
    const completed = await loadBaseArtJob(env, job.id);
    if (!completed) return null;
    const synced = await syncCutoutFromImageJob(env, completed);
    return synced && TERMINAL.has(synced.status) ? { companionId: synced.companion_id } : null;
  } catch (err) {
    const capacityDelay = await maybeDelayRunningHubCapacityError(env, job, err);
    if (capacityDelay !== "continue") {
      if (capacityDelay === "timed_out") {
        const failed = await loadBaseArtJob(env, job.id);
        if (failed) await syncCutoutFromImageJob(env, failed);
      }
      return null;
    }
    if (err instanceof ImageGenError && !err.retryable) {
      await failImageJob(env, job, err.code, err.message);
      await syncCutoutFromImageJob(env, { ...job, error_code: err.code, error_message: err.message, status: "failed" });
      return { companionId: cutout.companion_id };
    }
    const code = err instanceof ImageGenError ? err.code : "provider_error";
    const message = err instanceof Error ? err.message : String(err);
    await failImageJob(env, job, code, message);
    await syncCutoutFromImageJob(env, { ...job, error_code: code, error_message: message, status: "failed" });
    throw err;
  }
}

export async function syncCutoutFromImageJob(
  env: Env,
  job: ImageGenJobRow,
): Promise<CompanionCutoutJobRow | null> {
  if (job.task !== TASK_CUTOUT) return null;
  const cutout = await loadCutoutByImageJob(env, job.id);
  if (!cutout) return null;

  if (job.status === "succeeded" && job.output_key) {
    await updateCutout(env, cutout.id, {
      completed_at: job.completed_at ?? Date.now(),
      error_code: null,
      error_message: null,
      output_key: job.output_key,
      status: "succeeded",
    });
    await env.DB.prepare(
      `UPDATE companions
       SET art_cutout_key = ?, updated_at = ?
       WHERE id = ? AND art_url = ?`,
    )
      .bind(job.output_key, Date.now(), cutout.companion_id, cutout.source_art_url)
      .run();
    return loadCutoutById(env, cutout.id);
  }

  if (job.status === "failed" || job.status === "cancelled") {
    await updateCutout(env, cutout.id, {
      completed_at: job.completed_at ?? Date.now(),
      error_code: job.error_code,
      error_message: job.error_message,
      status: job.status,
    });
    return loadCutoutById(env, cutout.id);
  }

  await updateCutout(env, cutout.id, { status: job.status });
  return loadCutoutById(env, cutout.id);
}

export async function reenqueueCutoutJob(env: Env, cutout: CompanionCutoutJobRow): Promise<void> {
  await reenqueueImageJob(env, cutout.image_job_id);
}

async function insertImageJob(
  env: Env,
  jobId: string,
  userId: string | null,
  sourceArtUrl: string,
  now: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO image_generation_jobs
       (id, user_id, task, mode, status, workflow_key, prompt, input_keys,
        output_prefix, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, '', ?, ?, ?, ?)`,
  )
    .bind(
      jobId,
      userId,
      TASK_CUTOUT,
      MODE_COLUMN,
      CUTOUT_WORKFLOW_KEY,
      JSON.stringify([sourceArtUrl]),
      OUTPUT_PREFIX,
      now,
      now,
    )
    .run();
}

async function enqueue(env: Env, jobId: string, now: number): Promise<void> {
  await sendImageJob(env, {
    created_at: new Date(now).toISOString(),
    job_id: jobId,
    type: "image.generate",
  });
}

export async function loadCutoutByCompanionAndSource(
  env: Env,
  companionId: string,
  sourceArtUrl: string,
): Promise<CompanionCutoutJobRow | null> {
  return env.DB.prepare(
    `SELECT * FROM companion_cutout_jobs WHERE companion_id = ? AND source_art_url = ?`,
  )
    .bind(companionId, sourceArtUrl)
    .first<CompanionCutoutJobRow>();
}

async function loadCutoutById(env: Env, id: string): Promise<CompanionCutoutJobRow | null> {
  return env.DB.prepare(`SELECT * FROM companion_cutout_jobs WHERE id = ?`)
    .bind(id)
    .first<CompanionCutoutJobRow>();
}

type CutoutPatch = Partial<
  Pick<
    CompanionCutoutJobRow,
    "status" | "output_key" | "error_code" | "error_message" | "completed_at"
  >
>;

async function updateCutout(env: Env, id: string, patch: CutoutPatch): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) return;
  fields.push("updated_at = ?");
  values.push(Date.now());
  values.push(id);
  await env.DB.prepare(`UPDATE companion_cutout_jobs SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}
