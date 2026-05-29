import { createSignedObjectUrl } from "./signed-url";
import {
  ImageGenError,
  type ArtStyle,
  type ImageGenProvider,
  type ImageGenRequest,
  type ImageGenResponse,
} from "./types";

type RunningHubEnv = Env & {
  RUNNINGHUB_API_KEY?: string;
  RUNNINGHUB_BASE_URL?: string;
  RUNNINGHUB_WORKFLOW_ID?: string;
  RUNNINGHUB_LOAD_IMAGE_NODE_ID?: string;
  RUNNINGHUB_PROMPT_NODE_ID?: string;
  RUNNINGHUB_WEBHOOK_SECRET?: string;
  RUNNINGHUB_WEBHOOK_URL?: string;
  /**
   * spec-022 WF-1 create config. JSON map keyed by art style:
   *   { "anime_kr": { "workflowId": "...", "promptNodeId": "6",
   *                   "checkpointNodeId"?: "4", "ckptName"?: "..." } }
   * checkpointNodeId/ckptName are optional — only needed when one workflow
   * swaps checkpoints per style; with one workflow per style they are omitted.
   */
  RUNNINGHUB_CREATE_WORKFLOWS?: string;
};

type CreateWorkflowConfig = {
  workflowId: string;
  promptNodeId: string;
  checkpointNodeId?: string;
  ckptName?: string;
};

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
    if (req.mode === "create" && !req.source_art_url) {
      return generateCreate(req, env);
    }
    return generateVariation(req, env);
  },
};

/** WF-1 create (txt2img): only the prompt node is overridden. */
async function generateCreate(req: ImageGenRequest, env: Env): Promise<ImageGenResponse> {
  const config = readCreateConfig(env, req.style);
  const nodeInfoList: NodeInfo[] = [
    { fieldName: "text", fieldValue: req.prompt, nodeId: config.promptNodeId },
  ];
  if (config.checkpointNodeId && config.ckptName) {
    nodeInfoList.push({
      fieldName: "ckpt_name",
      fieldValue: config.ckptName,
      nodeId: config.checkpointNodeId,
    });
  }
  return submitTask(env, config.workflowId, nodeInfoList, `companion-create-${req.style}`);
}

/** Existing emotion-pack path (img2img): load-image + prompt. */
async function generateVariation(req: ImageGenRequest, env: Env): Promise<ImageGenResponse> {
  const config = readConfig(env);
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
  return submitTask(env, config.workflowId, nodeInfoList, MODEL);
}

async function submitTask(
  env: Env,
  workflowId: string,
  nodeInfoList: NodeInfo[],
  model: string,
): Promise<ImageGenResponse> {
  const apiKey = readApiKey(env);
  const config = env as RunningHubEnv;
  const baseUrl = (config.RUNNINGHUB_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const webhookUrl = config.RUNNINGHUB_WEBHOOK_URL?.trim();
  const body = {
    apiKey,
    nodeInfoList,
    webhookUrl: webhookUrl
      ? buildWebhookUrl(webhookUrl, config.RUNNINGHUB_WEBHOOK_SECRET?.trim() || null)
      : undefined,
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

function readApiKey(env: Env): string {
  const apiKey = (env as RunningHubEnv).RUNNINGHUB_API_KEY?.trim();
  if (!apiKey) {
    throw new ImageGenError(
      "provider_not_configured",
      "RunningHub image provider missing config: RUNNINGHUB_API_KEY",
      { retryable: false },
    );
  }
  return apiKey;
}

function readCreateConfig(env: Env, style: ArtStyle | undefined): CreateWorkflowConfig {
  readApiKey(env);
  if (!style) {
    throw new ImageGenError("provider_config_error", "create mode requires a style", {
      retryable: false,
    });
  }

  const raw = (env as RunningHubEnv).RUNNINGHUB_CREATE_WORKFLOWS?.trim();
  let parsed: Record<string, Partial<CreateWorkflowConfig>> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, Partial<CreateWorkflowConfig>>;
    } catch {
      throw new ImageGenError(
        "provider_config_error",
        "RUNNINGHUB_CREATE_WORKFLOWS is not valid JSON",
        { retryable: false },
      );
    }
  }

  const entry = parsed[style];
  if (!entry?.workflowId?.trim() || !entry?.promptNodeId?.toString().trim()) {
    throw new ImageGenError(
      "provider_not_configured",
      `RunningHub create workflow not configured for style: ${style}`,
      { retryable: false },
    );
  }

  return {
    checkpointNodeId: entry.checkpointNodeId?.toString().trim() || undefined,
    ckptName: entry.ckptName?.trim() || undefined,
    promptNodeId: entry.promptNodeId.toString().trim(),
    workflowId: entry.workflowId.trim(),
  };
}

function readConfig(env: Env): {
  apiKey: string;
  baseUrl: string;
  loadImageNodeId: string;
  promptNodeId: string;
  webhookSecret: string | null;
  webhookUrl: string;
  workflowId: string;
} {
  const config = env as RunningHubEnv;
  const apiKey = config.RUNNINGHUB_API_KEY?.trim();
  const workflowId = config.RUNNINGHUB_WORKFLOW_ID?.trim();
  const loadImageNodeId = config.RUNNINGHUB_LOAD_IMAGE_NODE_ID?.trim();
  const promptNodeId = config.RUNNINGHUB_PROMPT_NODE_ID?.trim();
  const webhookUrl = config.RUNNINGHUB_WEBHOOK_URL?.trim();

  const missing = [
    ["RUNNINGHUB_API_KEY", apiKey],
    ["RUNNINGHUB_WORKFLOW_ID", workflowId],
    ["RUNNINGHUB_LOAD_IMAGE_NODE_ID", loadImageNodeId],
    ["RUNNINGHUB_PROMPT_NODE_ID", promptNodeId],
    ["RUNNINGHUB_WEBHOOK_URL", webhookUrl],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new ImageGenError(
      "provider_not_configured",
      `RunningHub image provider missing config: ${missing.join(", ")}`,
      { retryable: false },
    );
  }

  return {
    apiKey: apiKey!,
    baseUrl: (config.RUNNINGHUB_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    loadImageNodeId: loadImageNodeId!,
    promptNodeId: promptNodeId!,
    webhookSecret: config.RUNNINGHUB_WEBHOOK_SECRET?.trim() || null,
    webhookUrl: webhookUrl!,
    workflowId: workflowId!,
  };
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
