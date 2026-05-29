import { getJobByExternalTaskId, listStaleExternalJobs, type ArtJobRow } from "../companions/emotion-art";
import { completeArtJobWithImage, markArtJobFailed } from "../companions/art-consumer";
import {
  completeImageJobWithImage,
  failImageJob,
  getImageJobByProviderTaskId,
  listStaleImageJobs,
  type ImageGenJobRow,
} from "./base-art";
import { jsonResponse } from "../http";

type RunningHubResultEnv = Env & {
  RUNNINGHUB_API_KEY?: string;
  RUNNINGHUB_BASE_URL?: string;
  RUNNINGHUB_WEBHOOK_SECRET?: string;
};

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

export async function handleRunningHubWebhookRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== "/webhooks/runninghub") return null;
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }
  if (!isAuthorizedWebhook(request, env)) {
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
  const staleJobs = await listStaleExternalJobs(env, now - 5 * 60 * 1000);

  for (const job of staleJobs) {
    if (!job.external_task_id) continue;
    if (now - job.updated_at > 15 * 60 * 1000) {
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
  const staleImageJobs = await listStaleImageJobs(env, now - 5 * 60 * 1000);
  for (const job of staleImageJobs) {
    if (!job.provider_task_id) continue;
    if (now - job.updated_at > 15 * 60 * 1000) {
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
  const config = readApiConfig(env);
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
  const config = readApiConfig(env);
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

function isAuthorizedWebhook(request: Request, env: Env): boolean {
  const secret = (env as RunningHubResultEnv).RUNNINGHUB_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = request.headers.get("x-runninghub-webhook-secret");
  return querySecret === secret || headerSecret === secret;
}

function readApiConfig(env: Env): { apiKey: string; baseUrl: string } {
  const config = env as RunningHubResultEnv;
  const apiKey = config.RUNNINGHUB_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RUNNINGHUB_API_KEY is required");
  }
  return {
    apiKey,
    baseUrl: (config.RUNNINGHUB_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
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
