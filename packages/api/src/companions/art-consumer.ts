import {
  ImageGenError,
  getImageGenProvider,
  type ImageGenRequest,
} from "../image-gen";
import {
  type ArtJobQueuePayload,
  type ArtJobRow,
  getJob,
  isArtJobPayload,
  isNonNeutralEmotion,
  setEmotionArt,
  updateJob,
} from "./emotion-art";

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type CompanionArtRow = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  name: string;
  appearance: string | null;
  personality: string | null;
  relationship_role: string | null;
  gender: string | null;
};

export { isArtJobPayload };

/**
 * Worker queue handler entry for `companion.emotion_art.generate` messages.
 *
 * Caller (the top-level `queue()` handler) is responsible for ack/retry; this
 * function throws on retryable errors and resolves on success or terminal
 * failure. Terminal failure is also persisted on the job row so subsequent
 * delivery attempts see the failed state and skip.
 */
export async function processArtJob(env: Env, payload: ArtJobQueuePayload): Promise<void> {
  const job = await getJob(env, payload.job_id);
  if (!job) return;
  if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
    return;
  }

  const companion = await loadCompanionForJob(env, payload.companion_id);
  if (!companion) {
    await markArtJobFailed(env, job, "companion_not_found", "Companion no longer exists");
    return;
  }

  await updateJob(env, job.id, { status: "processing" });

  try {
    const imageProvider = getImageGenProvider(env);
    const request: ImageGenRequest = {
      companion: {
        appearance: companion.appearance,
        gender: companion.gender,
        name: companion.name,
        personality: companion.personality,
        relationship_role: companion.relationship_role,
      },
      emotion: payload.emotion,
      prompt: job.prompt,
      source_art_url: payload.source_art_url,
    };
    const response = await imageProvider.generate(request, env);

    if (response.type === "pending") {
      await updateJob(env, job.id, {
        external_task_id: response.external_task_id,
        model: response.model,
        provider: response.provider,
        status: "processing",
      });
      return;
    }

    await completeArtJobWithImage(env, job, {
      contentType: response.content_type,
      emotion: payload.emotion,
      imageBytes: response.image_bytes,
      model: response.model,
      provider: response.provider,
    });
  } catch (err) {
    if (err instanceof ImageGenError && !err.retryable) {
      await markArtJobFailed(env, job, err.code, err.message);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof ImageGenError ? err.code : "provider_error";
    await markArtJobFailed(env, job, code, message);
    throw err;
  }
}

export async function markArtJobFailed(
  env: Env,
  job: ArtJobRow,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  await updateJob(env, job.id, {
    completed_at: Date.now(),
    error_code: errorCode,
    error_message: errorMessage.slice(0, 1000),
    status: "failed",
  });
}

export async function completeArtJobWithImage(
  env: Env,
  job: ArtJobRow,
  input: {
    contentType: string;
    emotion: string;
    imageBytes: Uint8Array;
    model: string;
    provider: string;
  },
): Promise<void> {
  if (!isNonNeutralEmotion(input.emotion)) {
    await markArtJobFailed(env, job, "invalid_emotion", "Art job has invalid emotion");
    return;
  }

  const companion = await loadCompanionForJob(env, job.companion_id);
  if (!companion) {
    await markArtJobFailed(env, job, "companion_not_found", "Companion no longer exists");
    return;
  }

  const outputKey = buildOutputKey(companion, input.emotion, input.contentType);
  await env.ASSETS.put(outputKey, input.imageBytes, {
    customMetadata: {
      companion_id: companion.id,
      emotion: input.emotion,
      job_id: job.id,
      provider: input.provider,
      source: "companion-emotion-art",
    },
    httpMetadata: {
      contentType: input.contentType,
    },
  });
  await recordAsset(env, outputKey, input.contentType, input.imageBytes.byteLength);

  await setEmotionArt(env, companion.id, input.emotion, outputKey);
  await updateJob(env, job.id, {
    completed_at: Date.now(),
    error_code: null,
    error_message: null,
    model: input.model,
    output_key: outputKey,
    provider: input.provider,
    status: "succeeded",
  });
}

async function loadCompanionForJob(env: Env, companionId: string): Promise<CompanionArtRow | null> {
  return env.DB.prepare(
    `SELECT id, source, created_by, name, appearance, personality,
            relationship_role, gender
     FROM companions
     WHERE id = ?`,
  )
    .bind(companionId)
    .first<CompanionArtRow>();
}

function buildOutputKey(
  companion: CompanionArtRow,
  emotion: string,
  contentType: string,
): string {
  const ext = CONTENT_TYPE_EXTENSIONS[contentType] ?? "webp";
  const uuid = crypto.randomUUID();
  const owner =
    companion.source === "user" && companion.created_by
      ? `user/${companion.created_by}`
      : "official";
  return `companions/${owner}/${companion.id}/emotions/${emotion}-${uuid}.${ext}`;
}

async function recordAsset(
  env: Env,
  key: string,
  contentType: string,
  sizeBytes: number,
): Promise<void> {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO asset_objects (key, content_type, size_bytes) VALUES (?, ?, ?)",
  )
    .bind(key, contentType, sizeBytes)
    .run();
}

/**
 * Convenience wrapper that the top-level queue() handler uses to consume
 * art-gen messages out of a mixed batch. Returns true if the message was
 * recognized as an art job (regardless of success/failure), false otherwise.
 */
export async function tryHandleArtMessage(
  env: Env,
  message: { body: unknown },
): Promise<boolean> {
  if (!isArtJobPayload(message.body)) return false;
  await processArtJob(env, message.body);
  return true;
}
