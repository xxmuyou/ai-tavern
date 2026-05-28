import { NON_NEUTRAL_EMOTIONS, type NonNeutralEmotion } from "../image-gen";

export const KNOWN_EMOTIONS: ReadonlySet<string> = new Set([
  "neutral",
  ...NON_NEUTRAL_EMOTIONS,
]);

export type ArtJobStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ArtJobRow = {
  id: string;
  companion_id: string;
  user_id: string | null;
  emotion: string;
  status: ArtJobStatus;
  source_art_url: string;
  output_key: string | null;
  external_task_id: string | null;
  provider: string | null;
  model: string | null;
  prompt: string;
  error_code: string | null;
  error_message: string | null;
  credit_txn_id: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
};

export type ArtJobQueuePayload = {
  type: "companion.emotion_art.generate";
  job_id: string;
  companion_id: string;
  emotion: NonNeutralEmotion;
  source_art_url: string;
  created_at: string;
};

export function isNonNeutralEmotion(value: string): value is NonNeutralEmotion {
  return (NON_NEUTRAL_EMOTIONS as readonly string[]).includes(value);
}

/**
 * Parse the persisted `companions.art_emotions` JSON map.
 *
 * Returns only entries that match the known emotion vocabulary. If the
 * persisted value is missing/invalid, returns an empty object.
 */
export function parseArtEmotions(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (KNOWN_EMOTIONS.has(key) && typeof value === "string" && value.length > 0) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Build the initial `art_emotions` map for a freshly created/edited companion.
 *
 * spec-020 §A: only the neutral key is persisted. Non-neutral emotions are
 * filled in later by the generation pipeline.
 */
export function neutralOnlyArtEmotions(artUrl: string | null | undefined): Record<string, string> {
  if (!artUrl) return {};
  return { neutral: artUrl };
}

/**
 * Atomically merge a new emotion key into `companions.art_emotions`.
 *
 * Reads the current JSON, sets the given emotion → key, writes back.
 */
export async function setEmotionArt(
  env: Env,
  companionId: string,
  emotion: NonNeutralEmotion,
  outputKey: string,
): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT art_emotions FROM companions WHERE id = ?`,
  )
    .bind(companionId)
    .first<{ art_emotions: string | null }>();
  if (!row) return;

  const map = parseArtEmotions(row.art_emotions);
  map[emotion] = outputKey;

  await env.DB.prepare(
    `UPDATE companions SET art_emotions = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(JSON.stringify(map), Date.now(), companionId)
    .run();
}

/**
 * Drop all non-neutral entries from `companions.art_emotions`.
 *
 * Called when the neutral source image (`art_url`) changes, so existing
 * generated portraits don't drift from the new base.
 */
export async function clearNonNeutralEmotions(env: Env, companionId: string): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT art_emotions, art_url FROM companions WHERE id = ?`,
  )
    .bind(companionId)
    .first<{ art_emotions: string | null; art_url: string | null }>();
  if (!row) return;

  const map = parseArtEmotions(row.art_emotions);
  const next: Record<string, string> = {};
  if (row.art_url) next.neutral = row.art_url;
  else if (map.neutral) next.neutral = map.neutral;

  await env.DB.prepare(
    `UPDATE companions SET art_emotions = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(JSON.stringify(next), Date.now(), companionId)
    .run();
}

/**
 * Return an active (pending or processing) job for the given (companion,
 * emotion, source_art_url) triplet, if any. Used for dedup before enqueuing.
 */
export async function findActiveJob(
  env: Env,
  companionId: string,
  emotion: NonNeutralEmotion,
  sourceArtUrl: string,
): Promise<ArtJobRow | null> {
  return env.DB.prepare(
    `SELECT * FROM companion_art_jobs
     WHERE companion_id = ? AND emotion = ? AND source_art_url = ?
       AND status IN ('pending', 'processing')
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(companionId, emotion, sourceArtUrl)
    .first<ArtJobRow>();
}

export async function getJob(env: Env, jobId: string): Promise<ArtJobRow | null> {
  return env.DB.prepare(`SELECT * FROM companion_art_jobs WHERE id = ?`)
    .bind(jobId)
    .first<ArtJobRow>();
}

export async function getJobByExternalTaskId(
  env: Env,
  externalTaskId: string,
): Promise<ArtJobRow | null> {
  return env.DB.prepare(
    `SELECT * FROM companion_art_jobs
     WHERE external_task_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
  )
    .bind(externalTaskId)
    .first<ArtJobRow>();
}

export async function listStaleExternalJobs(
  env: Env,
  beforeUpdatedAt: number,
  limit = 20,
): Promise<ArtJobRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM companion_art_jobs
     WHERE status = 'processing'
       AND external_task_id IS NOT NULL
       AND updated_at < ?
     ORDER BY updated_at ASC
     LIMIT ?`,
  )
    .bind(beforeUpdatedAt, limit)
    .all<ArtJobRow>();
  return results ?? [];
}

export async function listJobsForCompanion(
  env: Env,
  companionId: string,
  limit = 50,
): Promise<ArtJobRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM companion_art_jobs
     WHERE companion_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(companionId, limit)
    .all<ArtJobRow>();
  return results ?? [];
}

export type EnqueueJobInput = {
  companionId: string;
  userId: string | null;
  emotion: NonNeutralEmotion;
  sourceArtUrl: string;
  prompt: string;
};

export type EnqueueJobResult =
  | { reused: true; job: ArtJobRow }
  | { reused: false; job: ArtJobRow };

/**
 * Insert or reuse a `companion_art_jobs` row and dispatch the queue message.
 *
 * Dedup rule: if an active (pending/processing) job already exists for the
 * same (companion, emotion, source_art_url), return it without queueing a
 * second job. If a previous attempt for the same triplet ended in
 * failed/cancelled, a new pending row is created (UNIQUE constraint allows
 * this because we update-in-place via the same id).
 */
export async function enqueueGenerationJob(
  env: Env,
  input: EnqueueJobInput,
): Promise<EnqueueJobResult> {
  const existing = await findActiveJob(env, input.companionId, input.emotion, input.sourceArtUrl);
  if (existing) {
    return { job: existing, reused: true };
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO companion_art_jobs
       (id, companion_id, user_id, emotion, status, source_art_url, prompt, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
     ON CONFLICT(companion_id, emotion, source_art_url) DO UPDATE SET
       status = 'pending',
       user_id = excluded.user_id,
       prompt = excluded.prompt,
       output_key = NULL,
       external_task_id = NULL,
       provider = NULL,
       model = NULL,
       error_code = NULL,
       error_message = NULL,
       credit_txn_id = NULL,
       updated_at = excluded.updated_at,
       completed_at = NULL`,
  )
    .bind(
      id,
      input.companionId,
      input.userId,
      input.emotion,
      input.sourceArtUrl,
      input.prompt,
      now,
      now,
    )
    .run();

  // Read back the row to capture the id that survived the UPSERT (might be
  // the original id if a previous failed job had this triplet).
  const job = await env.DB.prepare(
    `SELECT * FROM companion_art_jobs WHERE companion_id = ? AND emotion = ? AND source_art_url = ?`,
  )
    .bind(input.companionId, input.emotion, input.sourceArtUrl)
    .first<ArtJobRow>();

  if (!job) {
    throw new Error("failed_to_insert_art_job");
  }

  const payload: ArtJobQueuePayload = {
    companion_id: input.companionId,
    created_at: new Date(now).toISOString(),
    emotion: input.emotion,
    job_id: job.id,
    source_art_url: input.sourceArtUrl,
    type: "companion.emotion_art.generate",
  };
  await env.JOB_QUEUE.send(payload);

  return { job, reused: false };
}

export type UpdateJobInput = {
  status?: ArtJobStatus;
  output_key?: string | null;
  provider?: string | null;
  model?: string | null;
  external_task_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  completed_at?: number | null;
};

export async function updateJob(
  env: Env,
  jobId: string,
  patch: UpdateJobInput,
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
    `UPDATE companion_art_jobs SET ${fields.join(", ")} WHERE id = ?`,
  )
    .bind(...values)
    .run();
}

/**
 * Type guard for queue dispatcher: is this an art-generation payload?
 */
export function isArtJobPayload(value: unknown): value is ArtJobQueuePayload {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.type === "companion.emotion_art.generate" &&
    typeof obj.job_id === "string" &&
    typeof obj.companion_id === "string" &&
    typeof obj.emotion === "string" &&
    typeof obj.source_art_url === "string" &&
    isNonNeutralEmotion(obj.emotion)
  );
}
