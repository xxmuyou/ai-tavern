import {
  completeImageJobWithImage,
  failImageJob,
  getImageJobByProviderTaskId,
  listStaleImageJobs,
  listStalePendingImageJobs,
  markImageJobProviderPolled,
  reenqueueImageJob,
  updateImageJob,
  type ImageGenJobRow,
} from "./base-art";
import { syncCutoutFromImageJob } from "./cutout";
import { reenqueueMomentJobsForCompanion } from "./moment-image";
import { jsonResponse } from "../http";
import { getSetting } from "../settings/store";

type RunningHubOutput = {
  fileUrl?: string;
  fileType?: string;
  nodeId?: string;
  taskCostTime?: string | number;
  consumeCoins?: string | number | null;
};

type RunningHubApiResponse = {
  code: number;
  msg?: string;
  data?: unknown;
};

type RunningHubTaskResult =
  | { status: "pending" }
  | { status: "failed"; errorCode: string; errorMessage: string }
  | { status: "succeeded"; output: RunningHubOutput };

const DEFAULT_BASE_URL = "https://www.runninghub.ai";
const MAX_RESULT_BYTES = 10 * 1024 * 1024;
// A `processing` job with no progress for this long is eligible for cron
// reconciliation. Kept short so a missed webhook is recovered on the next cron
// tick rather than stranding the job until the hard timeout below.
const STALE_AFTER_MS = 2 * 60 * 1000;
// Absolute ceiling: a task still unresolved this long after its last update is
// marked failed so it can't sit in `processing` forever.
const HARD_TIMEOUT_MS = 15 * 60 * 1000;

type PollImageJobOptions = {
  now?: number;
  staleAfterMs?: number;
};

export async function handleRunningHubWebhookRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== "/webhooks/runninghub") return null;
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }
  if (!(await isAuthorizedWebhook(request, env))) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const taskId = extractTaskId(payload);
  if (!taskId) {
    return jsonResponse({ error: "task_id_required" }, { status: 400 });
  }

  const imageJob = await getImageJobByProviderTaskId(env, taskId);
  if (!imageJob) {
    return jsonResponse({ error: "unknown_task_id" }, { status: 404 });
  }
  const directResult = parseTaskResult(payload);
  const result = directResult.status === "pending"
    ? await fetchRunningHubTaskResult(env, taskId)
    : directResult;
  await applyRunningHubImageJobResult(env, imageJob, result);

  return jsonResponse({ ok: true });
}

export async function pollStaleRunningHubArtJobs(env: Env): Promise<void> {
  const now = Date.now();

  // Generic image_generation_jobs (base-art drafts, etc.) — same fallback so a
  // missed webhook doesn't strand a job in `processing`.
  const staleImageJobs = await listStaleImageJobs(
    env,
    now - STALE_AFTER_MS,
    now - STALE_AFTER_MS,
    now - HARD_TIMEOUT_MS,
  );
  for (const job of staleImageJobs) {
    await pollRunningHubImageJobIfDue(env, job, { now, staleAfterMs: STALE_AFTER_MS });
  }

  // Recover `pending` image jobs whose queue message was never delivered (no
  // provider_task_id yet). Past the hard ceiling they're failed so the UI stops
  // spinning; otherwise they're re-enqueued once to self-heal a lost message.
  const stalePending = await listStalePendingImageJobs(env, now - STALE_AFTER_MS);
  for (const job of stalePending) {
    if (now - job.updated_at > HARD_TIMEOUT_MS) {
      await failImageJob(env, job, "stuck_pending", "Job was never picked up by the queue consumer");
      continue;
    }
    try {
      await reenqueueImageJob(env, job.id);
    } catch (err) {
      console.warn(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          job_id: job.id,
          message: "Re-enqueue of stale pending image job failed; will retry on next cron",
        }),
      );
    }
  }
}

export async function pollRunningHubImageJobIfDue(
  env: Env,
  job: ImageGenJobRow,
  options: PollImageJobOptions = {},
): Promise<boolean> {
  const now = options.now ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? STALE_AFTER_MS;
  if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
    return false;
  }
  if (!job.provider_task_id) return false;

  if (now - job.updated_at > HARD_TIMEOUT_MS) {
    await failImageJob(env, job, "timeout", "RunningHub task exceeded 15 minutes");
    return true;
  }
  if (now - job.updated_at <= staleAfterMs) return false;
  if (job.provider_last_polled_at && now - job.provider_last_polled_at <= staleAfterMs) {
    return false;
  }

  try {
    await markImageJobProviderPolled(env, job.id, now);
    const result = await fetchRunningHubTaskResult(env, job.provider_task_id);
    await applyRunningHubImageJobResult(env, job, result);
    return true;
  } catch (err) {
    console.warn(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        job_id: job.id,
        message: "RunningHub image-job poll failed; will retry after throttle window",
        provider_task_id: job.provider_task_id,
      }),
    );
    return false;
  }
}

async function applyRunningHubImageJobResult(
  env: Env,
  job: ImageGenJobRow,
  result: RunningHubTaskResult,
): Promise<void> {
  if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
    return;
  }
  if (result.status === "pending") return;
  if (result.status === "failed") {
    await updateImageJob(env, job.id, { provider_result_received_at: Date.now() });
    await failImageJob(env, job, result.errorCode, result.errorMessage);
    const synced = await syncCutoutFromImageJob(env, {
      ...job,
      completed_at: Date.now(),
      error_code: result.errorCode,
      error_message: result.errorMessage,
      status: "failed",
    });
    if (synced) {
      await reenqueueMomentJobsForCompanion(env, synced.companion_id);
    }
    return;
  }

  const receivedAt = Date.now();
  const downloaded = await downloadResultImage(result.output);
  await updateImageJob(env, job.id, {
    provider_consume_coins: parseProviderNumber(result.output.consumeCoins),
    provider_result_received_at: receivedAt,
    provider_task_cost_time_ms: parseTaskCostTimeMs(result.output.taskCostTime),
  });
  const outputKey = await completeImageJobWithImage(env, job, {
    bytes: downloaded.bytes,
    contentType: downloaded.contentType,
    model: job.model ?? "companion-create-v1",
    provider: job.provider ?? "runninghub",
  });
  const synced = await syncCutoutFromImageJob(env, {
    ...job,
    completed_at: Date.now(),
    output_key: outputKey,
    status: "succeeded",
  });
  if (synced?.status === "succeeded") {
    await reenqueueMomentJobsForCompanion(env, synced.companion_id);
  }
}

function parseProviderNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTaskCostTimeMs(value: string | number | null | undefined): number | null {
  const parsed = parseProviderNumber(value);
  if (parsed === null) return null;
  const ms = parsed > 10_000 ? parsed : parsed * 1000;
  return Math.max(0, Math.round(ms));
}

async function fetchRunningHubTaskResult(
  env: Env,
  taskId: string,
): Promise<RunningHubTaskResult> {
  const config = await readApiConfig(env);
  const outputResponse = await callRunningHub(env, `${config.baseUrl}/task/openapi/outputs`, {
    taskId,
  });
  const outputResult = parseTaskResult(outputResponse);
  if (outputResult.status !== "pending") return outputResult;

  const statusResponse = await callRunningHub(env, `${config.baseUrl}/task/openapi/status`, {
    taskId,
  });
  return parseStatusResult(statusResponse);
}

async function callRunningHub(
  env: Env,
  url: string,
  body: { taskId: string },
): Promise<RunningHubApiResponse> {
  const config = await readApiConfig(env);
  const response = await fetch(url, {
    body: JSON.stringify({ apiKey: config.apiKey, taskId: body.taskId }),
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`RunningHub request failed with HTTP ${response.status}`);
  }
  return response.json() as Promise<RunningHubApiResponse>;
}

function parseTaskResult(payload: unknown): RunningHubTaskResult {
  if (!payload || typeof payload !== "object") return { status: "pending" };
  const obj = payload as RunningHubApiResponse & Record<string, unknown>;
  if (obj.code !== undefined && obj.code !== 0) {
    if (isRunningHubTaskStillRunningMessage(obj.msg)) {
      return { status: "pending" };
    }
    return {
      errorCode: "provider_error",
      errorMessage: readErrorMessage(obj.data) ?? readErrorMessage(obj) ?? obj.msg ?? `RunningHub returned code ${obj.code}`,
      status: "failed",
    };
  }

  const data = obj.data;
  if (Array.isArray(data)) {
    const output = data.find((item): item is RunningHubOutput => {
      return Boolean(item && typeof item === "object" && typeof (item as RunningHubOutput).fileUrl === "string");
    });
    if (output) return { output, status: "succeeded" };
    return { status: "pending" };
  }

  const nestedStatus = readStatus(data) ?? readStatus(obj);
  if (nestedStatus === "FAILED") {
    return {
      errorCode: "provider_task_failed",
      errorMessage: readErrorMessage(data) ?? readErrorMessage(obj) ?? "RunningHub task failed",
      status: "failed",
    };
  }
  if (nestedStatus === "SUCCESS") {
    return { status: "pending" };
  }
  return { status: "pending" };
}

function parseStatusResult(payload: RunningHubApiResponse): RunningHubTaskResult {
  if (payload.code !== 0) {
    if (isRunningHubTaskStillRunningMessage(payload.msg)) {
      return { status: "pending" };
    }
    return {
      errorCode: "provider_error",
      errorMessage: readErrorMessage(payload.data) ?? readErrorMessage(payload) ?? payload.msg ?? `RunningHub returned code ${payload.code}`,
      status: "failed",
    };
  }

  const status = readStatus(payload.data) ?? readStatus(payload);
  if (status === "FAILED") {
    return {
      errorCode: "provider_task_failed",
      errorMessage: readErrorMessage(payload.data) ?? readErrorMessage(payload) ?? "RunningHub task failed",
      status: "failed",
    };
  }
  return { status: "pending" };
}

function isRunningHubTaskStillRunningMessage(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.trim().toUpperCase();
  return normalized.includes("TASK_IS_RUNNING");
}

async function downloadResultImage(output: RunningHubOutput): Promise<{
  bytes: Uint8Array;
  contentType: string;
}> {
  if (!output.fileUrl) {
    throw new Error("runninghub_output_missing_file_url");
  }

  const response = await fetch(output.fileUrl);
  if (!response.ok) {
    throw new Error(`runninghub_output_download_failed_${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_RESULT_BYTES) {
    throw new Error("runninghub_output_too_large");
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_RESULT_BYTES) {
    throw new Error("runninghub_output_too_large");
  }

  return {
    bytes: new Uint8Array(buffer),
    contentType: response.headers.get("content-type") ?? contentTypeFromFileType(output.fileType),
  };
}

function extractTaskId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of ["taskId", "task_id"]) {
    if (typeof obj[key] === "string" && obj[key]) return obj[key];
  }
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    const nested = obj.data as Record<string, unknown>;
    for (const key of ["taskId", "task_id"]) {
      if (typeof nested[key] === "string" && nested[key]) return nested[key];
    }
  }
  return null;
}

async function isAuthorizedWebhook(request: Request, env: Env): Promise<boolean> {
  const secret = await getSetting(env, "image_gen.webhook_secret");
  if (!secret) return true;
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = request.headers.get("x-runninghub-webhook-secret");
  return querySecret === secret || headerSecret === secret;
}

async function readApiConfig(env: Env): Promise<{ apiKey: string; baseUrl: string }> {
  const apiKey = await getSetting(env, "image_gen.api_key");
  if (!apiKey) {
    throw new Error("RUNNINGHUB_API_KEY is required");
  }
  const baseUrl = await getSetting(env, "image_gen.runninghub_base_url");
  return {
    apiKey,
    baseUrl: (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ""),
  };
}

function readStatus(value: unknown): "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" | null {
  if (typeof value === "string") return normalizeStatus(value);
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["status", "taskStatus", "task_status"]) {
    if (typeof obj[key] === "string") return normalizeStatus(obj[key]);
  }
  return null;
}

function normalizeStatus(value: string): "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" | null {
  const upper = value.toUpperCase();
  if (upper.includes("SUCCESS") || upper.includes("SUCCEEDED")) return "SUCCESS";
  if (upper.includes("FAIL")) return "FAILED";
  if (upper.includes("RUNNING") || upper.includes("PROCESSING")) return "RUNNING";
  if (upper.includes("QUEUE")) return "QUEUED";
  return null;
}

function readErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["errorMessage", "error_message", "failedReason", "msg"]) {
    const item = obj[key];
    const summarized = summarizeProviderError(item);
    if (summarized) return summarized;
  }
  const summarized = summarizeProviderError(obj);
  if (summarized) return summarized;
  return null;
}

function summarizeProviderError(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return summarizeProviderErrorString(value) ?? value.slice(0, 1000);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;

  const failedReason = summarizeProviderError(obj.failedReason);
  if (failedReason) return failedReason;

  const nodeName = typeof obj.node_name === "string" && obj.node_name ? obj.node_name : null;
  const exceptionType = typeof obj.exception_type === "string" && obj.exception_type ? obj.exception_type : null;
  const exceptionMessage =
    typeof obj.exception_message === "string" && obj.exception_message ? obj.exception_message : null;
  if (exceptionMessage) {
    const assetError = formatProviderAssetError(exceptionMessage, nodeName);
    if (assetError) return assetError;
  }
  if (nodeName && exceptionType && exceptionMessage) return `${nodeName}: ${exceptionType}: ${exceptionMessage}`.slice(0, 1000);
  if (nodeName && exceptionMessage) return `${nodeName}: ${exceptionMessage}`.slice(0, 1000);
  if (exceptionType && exceptionMessage) return `${exceptionType}: ${exceptionMessage}`.slice(0, 1000);

  const nodeErrors = summarizeNodeErrors(obj.node_errors);
  if (nodeErrors) return nodeErrors;

  const error = obj.error && typeof obj.error === "object" && !Array.isArray(obj.error)
    ? (obj.error as Record<string, unknown>)
    : null;
  if (typeof error?.message === "string" && error.message) return error.message.slice(0, 1000);

  return null;
}

function summarizeProviderErrorString(value: string): string | null {
  const trimmed = value.trim();
  const jsonStart = trimmed.includes("||") ? trimmed.slice(trimmed.indexOf("||") + 2) : trimmed;
  if (!jsonStart.startsWith("{") && !jsonStart.startsWith("[")) return null;
  try {
    return summarizeProviderError(JSON.parse(jsonStart));
  } catch {
    return null;
  }
}

function summarizeNodeErrors(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const nodeError of Object.values(value as Record<string, unknown>)) {
    if (!nodeError || typeof nodeError !== "object" || Array.isArray(nodeError)) continue;
    const obj = nodeError as Record<string, unknown>;
    const nodeName = typeof obj.node_name === "string" && obj.node_name ? obj.node_name : "RunningHub node";
    const errors = Array.isArray(obj.errors) ? obj.errors : [];
    for (const error of errors) {
      if (!error || typeof error !== "object" || Array.isArray(error)) continue;
      const detail = (error as Record<string, unknown>).details;
      const message = (error as Record<string, unknown>).message;
      if (typeof detail === "string" && detail) {
        return (formatProviderAssetError(detail, nodeName) ?? `${nodeName}: ${detail}`).slice(0, 1000);
      }
      if (typeof message === "string" && message) {
        return (formatProviderAssetError(message, nodeName) ?? `${nodeName}: ${message}`).slice(0, 1000);
      }
    }
  }
  return null;
}

function formatProviderAssetError(message: string, nodeName: string | null): string | null {
  const normalized = `${nodeName ?? ""} ${message}`.toLowerCase();
  const isLoraError = normalized.includes("lora") || normalized.includes("loraloader");
  const isCheckpointError =
    normalized.includes("ckpt_name") ||
    normalized.includes("checkpoint") ||
    normalized.includes("checkpoints") ||
    normalized.includes("unet");

  if (isLoraError) {
    return `LoRA asset error: selected LoRA is unavailable in RunningHub. Please choose another LoRA. Details: ${message}`;
  }
  if (isCheckpointError) {
    return `Checkpoint asset error: selected checkpoint is unavailable in RunningHub. Please choose another model. Details: ${message}`;
  }
  return null;
}

function contentTypeFromFileType(fileType: string | undefined): string {
  switch (fileType?.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}
