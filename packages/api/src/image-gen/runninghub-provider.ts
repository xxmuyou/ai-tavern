import { resolveImageGenConfig, type ImageGenConfig } from "../settings/store";
import { normalizeObjectKey } from "./signed-url";
import {
  ImageGenError,
  type ImageGenProvider,
  type ImageGenRequest,
  type ImageGenResponse,
} from "./types";
import { getImageWorkflow } from "./models";
import { getWorkflowConfig, type WorkflowConfig } from "./workflows";

type NodeInfo = { nodeId: string; fieldName: string; fieldValue: string };

type RunningHubCreateResponse = {
  code: number;
  msg?: string;
  data?: {
    taskId?: string;
    taskStatus?: string;
    promptTips?: string;
  };
};

type RunningHubUploadResponse = {
  code: number;
  msg?: string;
  data?: {
    fileName?: string;
  };
};

const DEFAULT_BASE_URL = "https://www.runninghub.ai";
const MODEL = "companion-expression-pack-v1";

export const runningHubImageGenProvider: ImageGenProvider = {
  name: "runninghub",

  async generate(req: ImageGenRequest, env: Env): Promise<ImageGenResponse> {
    const cfg = await resolveImageGenConfig(env);
    if (req.mode === "create" && !req.source_art_url) {
      return generateCreate(req, env, cfg);
    }
    return generateVariation(req, env, cfg);
  },
};

/** WF-1 create (txt2img): override prompt node, plus checkpoint when switching models. */
async function generateCreate(req: ImageGenRequest, env: Env, cfg: ImageGenConfig): Promise<ImageGenResponse> {
  const workflowKey = req.workflow_key?.trim() || "wf1";
  const config = await readWorkflowConfig(env, cfg, workflowKey);
  const nodeInfoList: NodeInfo[] = [
    { fieldName: config.promptFieldName || "text", fieldValue: req.prompt, nodeId: config.promptNodeId },
  ];
  // Checkpoint file comes from the selected model; the node field belongs to the workflow.
  const ckptName = req.ckpt_name?.trim();
  if (config.checkpointNodeId && ckptName) {
    nodeInfoList.push({
      fieldName: config.checkpointFieldName?.trim() || req.checkpoint_field_name?.trim() || "ckpt_name",
      fieldValue: ckptName,
      nodeId: config.checkpointNodeId,
    });
  } else if (ckptName && !config.checkpointNodeId) {
    // ckpt_name is set but the workflow has no checkpoint node to override —
    // the model silently falls back to the workflow's built-in checkpoint.
    // The admin workspace flags this; log it here as a runtime safety net.
    console.warn(
      `[runninghub] ckpt_name "${ckptName}" ignored for workflow "${workflowKey}": ` +
        `no checkpointNodeId configured; using the workflow's built-in checkpoint.`,
    );
  }
  return submitTask(cfg, config.workflowId, nodeInfoList, `companion-create-${workflowKey}`);
}

/** WF-2 variation (img2img): load-image + prompt. */
async function generateVariation(
  req: ImageGenRequest,
  env: Env,
  cfg: ImageGenConfig,
): Promise<ImageGenResponse> {
  const workflowKey = req.workflow_key?.trim() || "wf2";
  const config = await readWorkflowConfig(env, cfg, workflowKey);
  if (!config.loadImageNodeId) {
    throw new ImageGenError(
      "provider_not_configured",
      `RunningHub workflow "${workflowKey}" missing config: load-image node id`,
      { retryable: false },
    );
  }
  if (!cfg.webhookUrl) {
    throw new ImageGenError(
      "provider_not_configured",
      "RunningHub image provider missing config: webhook url",
      { retryable: false },
    );
  }
  if (!req.source_art_url) {
    throw new ImageGenError("invalid_source_art_url", "source_art_url is required for variation", {
      retryable: false,
    });
  }
  // RunningHub's LoadImage node takes the *fileName* of an image already
  // uploaded into its input dir — not a URL. Upload the source bytes first,
  // then inject the returned fileName. (Feeding a URL here makes RunningHub
  // accept the task but fail at the LoadImage node during render.)
  const fileName = await uploadSourceImage(cfg, env, req.source_art_url);
  const nodeInfoList: NodeInfo[] = [
    { fieldName: "image", fieldValue: fileName, nodeId: config.loadImageNodeId },
    { fieldName: config.promptFieldName || "text", fieldValue: req.prompt, nodeId: config.promptNodeId },
  ];
  return submitTask(cfg, config.workflowId, nodeInfoList, MODEL);
}

/**
 * Upload an R2-stored source image to RunningHub and return its `fileName`.
 *
 * The standard ComfyUI LoadImage node references an image by the filename it
 * has in the server's input directory, which is populated via this upload
 * endpoint. We read the bytes straight from R2 (no public round-trip) and POST
 * them as multipart form-data; the host must match the create host so the
 * uploaded file is visible to the task.
 */
async function uploadSourceImage(
  cfg: ImageGenConfig,
  env: Env,
  sourceArtUrl: string,
): Promise<string> {
  const key = normalizeObjectKey(sourceArtUrl);
  if (!key) {
    throw new ImageGenError("invalid_source_art_url", "source_art_url missing or invalid", {
      retryable: false,
    });
  }
  const object = await env.ASSETS.get(key);
  if (!object) {
    throw new ImageGenError("source_art_not_found", `Source art not found in R2: ${key}`, {
      retryable: false,
    });
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  const contentType = object.httpMetadata?.contentType ?? "image/png";

  const apiKey = requireApiKey(cfg);
  const baseUrl = (cfg.runninghubBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const form = new FormData();
  form.append("apiKey", apiKey);
  form.append("fileType", "image");
  form.append("file", new Blob([bytes], { type: contentType }), fileNameFor(key, contentType));

  const response = await fetch(`${baseUrl}/task/openapi/upload`, {
    body: form,
    headers: { authorization: `Bearer ${apiKey}` },
    method: "POST",
  });

  const json = await readJson<RunningHubUploadResponse>(response);
  if (!response.ok || json.code !== 0) {
    const msg = json.msg || `RunningHub upload failed with HTTP ${response.status}`;
    throw new ImageGenError("provider_upload_failed", msg, {
      retryable: response.status >= 500 && response.status < 600,
    });
  }
  const fileName = json.data?.fileName;
  if (!fileName) {
    throw new ImageGenError(
      "provider_bad_response",
      "RunningHub upload response did not include fileName",
      { retryable: true },
    );
  }
  return fileName;
}

/** Derive a sensible upload filename (with extension) from the R2 key + type. */
function fileNameFor(key: string, contentType: string): string {
  const base = key.split("/").pop() || "source";
  if (/\.[a-z0-9]+$/i.test(base)) return base;
  const ext = contentType.split("/")[1]?.split("+")[0] || "png";
  return `${base}.${ext}`;
}

async function submitTask(
  cfg: ImageGenConfig,
  workflowId: string,
  nodeInfoList: NodeInfo[],
  model: string,
): Promise<ImageGenResponse> {
  const apiKey = requireApiKey(cfg);
  const baseUrl = (cfg.runninghubBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const body = {
    apiKey,
    nodeInfoList,
    webhookUrl: cfg.webhookUrl ? buildWebhookUrl(cfg.webhookUrl, cfg.webhookSecret) : undefined,
    workflowId,
  };

  const response = await fetch(`${baseUrl}/task/openapi/create`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  const json = await readJson<RunningHubCreateResponse>(response);
  if (!response.ok || json.code !== 0) {
    throw toProviderError(json, response.status);
  }

  const taskId = json.data?.taskId;
  if (!taskId) {
    throw new ImageGenError(
      "provider_bad_response",
      "RunningHub create response did not include taskId",
      { retryable: true },
    );
  }

  if (json.data?.taskStatus === "FAILED") {
    throw new ImageGenError(
      "provider_task_failed",
      json.data.promptTips ?? "RunningHub rejected the workflow task",
      { retryable: false },
    );
  }

  return {
    external_task_id: taskId,
    model,
    provider: "runninghub",
    type: "pending",
  };
}

function requireApiKey(cfg: ImageGenConfig): string {
  if (!cfg.apiKey) {
    throw new ImageGenError(
      "provider_not_configured",
      "RunningHub image provider missing config: api key",
      { retryable: false },
    );
  }
  return cfg.apiKey;
}

async function readWorkflowConfig(env: Env, cfg: ImageGenConfig, key: string): Promise<WorkflowConfig> {
  requireApiKey(cfg);
  const dbWorkflow = await getImageWorkflow(env, key).catch(() => null);
  const config = dbWorkflow
    ? {
        checkpointFieldName: dbWorkflow.checkpoint_field_name || "ckpt_name",
        checkpointNodeId: dbWorkflow.checkpoint_node_id ?? undefined,
        key: dbWorkflow.key,
        label: dbWorkflow.label,
        loadImageNodeId: dbWorkflow.load_image_node_id ?? undefined,
        mode: dbWorkflow.mode,
        promptFieldName: dbWorkflow.prompt_field_name || "text",
        promptNodeId: dbWorkflow.prompt_node_id,
        workflowId: dbWorkflow.workflow_id,
      }
    : getWorkflowConfig(cfg.workflows, key);
  if (!config) {
    throw new ImageGenError(
      "provider_not_configured",
      `RunningHub workflow not configured: ${key}`,
      { retryable: false },
    );
  }
  if (!config.workflowId || !config.promptNodeId) {
    throw new ImageGenError(
      "provider_not_configured",
      `RunningHub workflow "${key}" missing workflow id or prompt node id`,
      { retryable: false },
    );
  }
  return config;
}

function buildWebhookUrl(webhookUrl: string, webhookSecret: string | null): string {
  if (!webhookSecret) return webhookUrl;
  const url = new URL(webhookUrl);
  url.searchParams.set("secret", webhookSecret);
  return url.toString();
}

function toProviderError(json: RunningHubCreateResponse, status: number): ImageGenError {
  const msg = json.msg || `RunningHub request failed with HTTP ${status}`;
  const retryable = status >= 500 && status < 600;
  const code = msg.includes("APIKEY_INVALID_NODE_INFO")
    ? "provider_config_error"
    : "provider_error";

  return new ImageGenError(code, msg, {
    retryable: code === "provider_config_error" ? false : retryable,
  });
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ImageGenError(
      "provider_bad_response",
      "RunningHub response was not valid JSON",
      { retryable: true },
    );
  }
}
