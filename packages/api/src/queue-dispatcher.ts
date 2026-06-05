import { LLMError } from "./llm";
import { isMemoryExtractPayload, processMemoryExtract } from "./chat/memory";
import { processSummary } from "./chat/summary-consumer";
import type { SummaryJobPayload } from "./chat/summary-queue";
import { isBaseArtJobPayload, loadBaseArtJob, processBaseArtJob } from "./image-gen/base-art";
import { TASK_CUTOUT, processCutoutJob } from "./image-gen/cutout";
import { TASK_MOMENT_IMAGE, processMomentImageJob, reenqueueMomentJobsForCompanion } from "./image-gen/moment-image";
import { TASK_OUTFIT_IMAGE, processOutfitImageJob } from "./image-gen/outfit-image";
import { TASK_PROFILE_OUTFIT_IMAGE, processProfileOutfitImageJob } from "./image-gen/profile-outfit";

function isSummaryPayload(value: unknown): value is SummaryJobPayload {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return obj.type === "chat.summary" && typeof obj.thread_id === "string";
}

/**
 * Top-level queue consumer dispatcher.
 *
 * Routes each message to the right per-feature handler based on its `type`
 * discriminator. Unrecognized messages are ack'd silently — that lets
 * unknown legacy / control messages drain without blocking the queue.
 */
export async function dispatchQueueBatch(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body;

    if (isSummaryPayload(body)) {
      try {
        await processSummary(env, body);
        message.ack();
      } catch (err) {
        if (err instanceof LLMError && !err.retryable) {
          console.warn(
            JSON.stringify({
              error: err.message,
              error_code: err.code,
              message: "Summary job dropped (non-retryable LLM config error)",
              thread_id: body.thread_id,
            }),
          );
          message.ack();
          continue;
        }
        console.error(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
            message: "Summary job failed, will retry",
            thread_id: body.thread_id,
          }),
        );
        message.retry();
      }
      continue;
    }

    if (isMemoryExtractPayload(body)) {
      try {
        await processMemoryExtract(env, body);
        message.ack();
      } catch (err) {
        if (err instanceof LLMError && !err.retryable) {
          console.warn(
            JSON.stringify({
              error: err.message,
              error_code: err.code,
              message: "Memory extract job dropped (non-retryable LLM config error)",
              thread_id: body.thread_id,
            }),
          );
          message.ack();
          continue;
        }
        console.error(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
            message: "Memory extract job failed, will retry",
            thread_id: body.thread_id,
          }),
        );
        message.retry();
      }
      continue;
    }

    if (isBaseArtJobPayload(body)) {
      try {
        // The image.generate payload is shared across image_generation_jobs
        // tasks; disambiguate by the job's task column.
        const job = await loadBaseArtJob(env, body.job_id);
        if (job?.task === TASK_MOMENT_IMAGE) {
          await processMomentImageJob(env, body.job_id);
        } else if (job?.task === TASK_CUTOUT) {
          const result = await processCutoutJob(env, body.job_id);
          if (result) {
            await reenqueueMomentJobsForCompanion(env, result.companionId);
          }
        } else if (job?.task === TASK_OUTFIT_IMAGE) {
          await processOutfitImageJob(env, body.job_id);
        } else if (job?.task === TASK_PROFILE_OUTFIT_IMAGE) {
          await processProfileOutfitImageJob(env, body.job_id);
        } else {
          await processBaseArtJob(env, body.job_id);
        }
        message.ack();
      } catch (err) {
        console.error(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
            job_id: body.job_id,
            message: "Image-gen job failed, will retry",
          }),
        );
        message.retry();
      }
      continue;
    }

    message.ack();
  }
}
