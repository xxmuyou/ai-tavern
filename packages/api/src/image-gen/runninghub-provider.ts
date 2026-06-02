import { resolveImageGenConfig, type ImageGenConfig } from "../settings/store";
import { createSignedObjectUrl } from "./signed-url";
import {
  ImageGenError,
  type ImageGenProvider,
  type ImageGenRequest,
  type ImageGenResponse,
} from "./types";
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

const DEFAULT_BASE_URL = "https://www.runninghub.ai";
const MODEL = "companion-expression-pack-v1";

export const runningHubImageGenProvider: ImageGenProvider = {
  name: "runninghub",

  async generate(req: ImageGenRequest, env: Env): Promise<ImageGenResponse> {
    const cfg = await resolveImageGenConfig(env);
    if (req.mode === "create" && !req.source_art_url) {
      return generateCreate(req, cfg);
    }
    return generateVariation(req, env, cfg);
  },
};

/** WF-1 create (txt2img): override prompt node, plus checkpoint when switching models. */
function generateCreate(req: ImageGenRequest, cfg: ImageGenConfig): Promise<ImageGenResponse> {
  const workflowKey = req.workflow_key?.trim() || "wf1";
  const config = readWorkflowConfig(cfg, workflowKey);
  const nodeInfoList: NodeInfo[] = [
    { fieldName: "text", fieldValue: req.prompt, nodeId: config.promptNodeId },
  ];
  // The creator-selected model supplies both the checkpoint file and the field
  // name on the workflow's checkpoint node (single source of truth).
  const ckptName = req.ckpt_name?.trim();
  if (config.checkpointNodeId && ckptName) {
    nodeInfoList.push({
      fieldName: req.checkpoint_field_name?.trim() || "ckpt_name",
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
  const config = readWorkflowConfig(cfg, workflowKey);
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
  const sourceUrl = await createSignedObjectUrl(env, req.source_art_url);
  const nodeInfoList: NodeInfo[] = [
    { fieldName: "url", fieldValue: sourceUrl, nodeId: config.loadImageNodeId },
    { fieldName: "text", fieldValue: req.prompt, nodeId: config.promptNodeId },
  ];
  return submitTask(cfg, config.workflowId, nodeInfoList, MODEL);
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

function readWorkflowConfig(cfg: ImageGenConfig, key: string): WorkflowConfig {
  requireApiKey(cfg);
  const config = getWorkflowConfig(cfg.workflows, key);
  if (!config) {
    throw new ImageGenError(
      "provider_not_configured",
      `RunningHub workflow not configured: ${key}`,
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
