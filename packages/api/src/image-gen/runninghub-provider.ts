import { createSignedObjectUrl } from "./signed-url";
import {
  ImageGenError,
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
};

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
    const config = readConfig(env);
    const sourceUrl = await createSignedObjectUrl(env, req.source_art_url);
    const body = {
      apiKey: config.apiKey,
      webhookUrl: buildWebhookUrl(config.webhookUrl, config.webhookSecret),
      workflowId: config.workflowId,
      nodeInfoList: [
        {
          fieldName: "url",
          fieldValue: sourceUrl,
          nodeId: config.loadImageNodeId,
        },
        {
          fieldName: "text",
          fieldValue: req.prompt,
          nodeId: config.promptNodeId,
        },
      ],
    };

    const response = await fetch(`${config.baseUrl}/task/openapi/create`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${config.apiKey}`,
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
      model: MODEL,
      provider: "runninghub",
      type: "pending",
    };
  },
};

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
