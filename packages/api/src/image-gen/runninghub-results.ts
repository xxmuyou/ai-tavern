import { getJobByExternalTaskId, listStaleExternalJobs, type ArtJobRow } from "../companions/emotion-art";
import { completeArtJobWithImage, markArtJobFailed } from "../companions/art-consumer";
import {
  completeImageJobWithImage,
  failImageJob,
  getImageJobByProviderTaskId,
  listStaleImageJobs,
  listStalePendingImageJobs,
  reenqueueImageJob,
  type ImageGenJobRow,
} from "./base-art";
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

  const job = await getJobByExternalTaskId(env, taskId);
  if (!job) {
    // Not a companion emotion-art job — maybe a generic image_generation_jobs
    // task (e.g. companion base-art draft, spec-022 WF-1 create).
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

  const directResult = parseTaskResult(payload);
  const result = directResult.status === "pending"
    ? await fetchRunningHubTaskResult(env, taskId)
    : directResult;
  await applyRunningHubTaskResult(env, job, result);

  return jsonResponse({ ok: true });
}

export async function pollStaleRunningHubArtJobs(env: Env): Promise<void> {
  const now = Date.now();
  const staleJobs = await listStaleExternalJobs(env, now - STALE_AFTER_MS);

  for (const job of staleJobs) {
    if (!job.external_task_id) continue;
    if (now - job.updated_at > HARD_TIMEOUT_MS) {
      await markArtJobFailed(env, job, "timeout", "RunningHub task exceeded 15 minutes");
      continue;
    }

    try {
      const result = await fetchRunningHubTaskResult(env, job.external_task_id);
      await applyRunningHubTaskResult(env, job, result);
    } catch (err) {
      console.warn(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          external_task_id: job.external_task_id,
          job_id: job.id,
          message: "RunningHub poll failed; will retry on next cron",
        }),
      );
    }
  }

  // Generic image_generation_jobs (base-art drafts, etc.) — same fallback so a
  // missed webhook doesn't strand a job in `processing`.
  const staleImageJobs = await listStaleImageJobs(env, now - STALE_AFTER_MS);
  for (const job of staleImageJobs) {
    if (!job.provider_task_id) continue;
    if (now - job.updated_at > HARD_TIMEOUT_MS) {
      await failImageJob(env, job, "timeout", "RunningHub task exceeded 15 minutes");
      continue;
    }

    try {
      const result = await fetchRunningHubTaskResult(env, job.provider_task_id);
      await applyRunningHubImageJobResult(env, job, result);
    } catch (err) {
      console.warn(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          job_id: job.id,
          message: "RunningHub image-job poll failed; will retry on next cron",
          provider_task_id: job.provider_task_id,
        }),
      );
    }
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
    await failImageJob(env, job, result.errorCode, result.errorMessage);
    return;
  }

  const downloaded = await downloadResultImage(result.output);
  await completeImageJobWithImage(env, job, {
    bytes: downloaded.bytes,
    contentType: downloaded.contentType,
    model: job.model ?? "companion-create-v1",
    provider: job.provider ?? "runninghub",
  });
}

async function applyRunningHubTaskResult(
  env: Env,
  job: ArtJobRow,
  result: RunningHubTaskResult,
): Promise<void> {
  if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
    return;
  }
  if (result.status === "pending") return;
  if (result.status === "failed") {
    await markArtJobFailed(env, job, result.errorCode, result.errorMessage);
    return;
  }

  const downloaded = await downloadResultImage(result.output);
  await completeArtJobWithImage(env, job, {
    contentType: downloaded.contentType,
    emotion: job.emotion,
    imageBytes: downloaded.bytes,
    model: job.model ?? "companion-expression-pack-v1",
    provider: job.provider ?? "runninghub",
  });
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
    return {
      errorCode: "provider_error",
      errorMessage: obj.msg ?? `RunningHub returned code ${obj.code}`,
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
    return {
      errorCode: "provider_error",
      errorMessage: payload.msg ?? `RunningHub returned code ${payload.code}`,
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
    if (typeof item === "string" && item) return item;
    if (item && typeof item === "object") return JSON.stringify(item).slice(0, 1000);
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
