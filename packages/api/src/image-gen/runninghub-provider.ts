import { resolveImageGenConfig, type ImageGenConfig } from "../settings/store";
import { parseWorkflowGenerationParams } from "./generation-params";
import { createSignedObjectUrl, normalizeObjectKey } from "./signed-url";
import {
  ImageGenError,
  type ImageGenProvider,
  type ImageGenRequest,
  type ImageGenResponse,
} from "./types";
import { getImageWorkflow } from "./models";
import { ANATOMY_NEGATIVE } from "./prompts";
import { findContractNode, workflowContractHasField } from "./runninghub-contract";
import {
  COMPANION_CUTOUT_WORKFLOW_KEY,
  PORTRAIT_CREATE_WORKFLOW_KEY,
  PORTRAIT_VARIATION_WORKFLOW_KEY,
  normalizeWorkflowKey,
} from "./workflow-keys";
import { getWorkflowConfig, type WorkflowConfig } from "./workflows";

type NodeInfo = { nodeId: string; fieldName: string; fieldValue: number | string };

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
const LOAD_IMAGE_URL_TTL_SECONDS = 6 * 60 * 60;

export const runningHubImageGenProvider: ImageGenProvider = {
  name: "runninghub",

  async generate(req: ImageGenRequest, env: Env): Promise<ImageGenResponse> {
    const cfg = await resolveImageGenConfig(env);
    if (req.mode === "cutout") {
      return generateCutout(req, env, cfg);
    }
    if (req.mode === "create" && !req.source_art_url) {
      return generateCreate(req, env, cfg);
    }
    return generateVariation(req, env, cfg);
  },
};

/** Portrait create (txt2img): override prompt node, plus checkpoint when switching models. */
async function generateCreate(req: ImageGenRequest, env: Env, cfg: ImageGenConfig): Promise<ImageGenResponse> {
  const workflowKey = normalizeWorkflowKey(req.workflow_key) || PORTRAIT_CREATE_WORKFLOW_KEY;
  const config = await readWorkflowConfig(env, cfg, workflowKey);
  const nodeInfoList: NodeInfo[] = [
    { fieldName: config.promptFieldName || "text", fieldValue: req.prompt ?? "", nodeId: config.promptNodeId },
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
    throw new ImageGenError(
      "provider_not_configured",
      `RunningHub workflow "${workflowKey}" cannot inject checkpoint "${ckptName}": missing checkpoint node id`,
      { retryable: false },
    );
  }
  appendLora(nodeInfoList, config, req);
  appendNegativePrompt(nodeInfoList, config);
  appendGenerationParams(nodeInfoList, config, req);
  return submitTask(cfg, config, nodeInfoList, `companion-create-${workflowKey}`);
}

/** Portrait variation (img2img): load-image + prompt. */
async function generateVariation(
  req: ImageGenRequest,
  env: Env,
  cfg: ImageGenConfig,
): Promise<ImageGenResponse> {
  const workflowKey = normalizeWorkflowKey(req.workflow_key) || PORTRAIT_VARIATION_WORKFLOW_KEY;
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
  // Standard LoadImage fields take an uploaded fileName. URL-style workflow
  // fields receive a short-lived public URL instead; the workflow contract is
  // the source of truth for which one applies.
  const sourceImageValue = await resolveLoadImageValue(cfg, env, req.source_art_url, config);
  const nodeInfoList: NodeInfo[] = [
    { fieldName: config.loadImageFieldName || "image", fieldValue: sourceImageValue, nodeId: config.loadImageNodeId },
    { fieldName: config.promptFieldName || "text", fieldValue: req.prompt ?? "", nodeId: config.promptNodeId },
  ];
  appendNegativePrompt(nodeInfoList, config);
  return submitTask(cfg, config, nodeInfoList, MODEL);
}

/** Companion cutout matting: load-image only, prompt node optional. */
async function generateCutout(
  req: ImageGenRequest,
  env: Env,
  cfg: ImageGenConfig,
): Promise<ImageGenResponse> {
  const workflowKey = normalizeWorkflowKey(req.workflow_key) || COMPANION_CUTOUT_WORKFLOW_KEY;
  const config = await readWorkflowConfig(env, cfg, workflowKey, { promptRequired: false });
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
    throw new ImageGenError("invalid_source_art_url", "source_art_url is required for cutout", {
      retryable: false,
    });
  }

  const sourceImageValue = await resolveLoadImageValue(cfg, env, req.source_art_url, config);
  const nodeInfoList: NodeInfo[] = [
    { fieldName: config.loadImageFieldName || "image", fieldValue: sourceImageValue, nodeId: config.loadImageNodeId },
  ];
  if (config.promptNodeId) {
    nodeInfoList.push({
      fieldName: config.promptFieldName || "text",
      fieldValue: req.prompt ?? "",
      nodeId: config.promptNodeId,
    });
  }
  return submitTask(cfg, config, nodeInfoList, `companion-cutout-${workflowKey}`);
}

async function resolveLoadImageValue(
  cfg: ImageGenConfig,
  env: Env,
  sourceArtUrl: string,
  config: WorkflowConfig,
): Promise<string> {
  if (loadImageFieldUsesUrl(config)) {
    return createSourceImageUrl(env, sourceArtUrl);
  }
  return uploadSourceImage(cfg, env, sourceArtUrl);
}

function loadImageFieldUsesUrl(config: WorkflowConfig): boolean {
  const fieldName = config.loadImageFieldName;
  const normalized = fieldName?.trim().toLowerCase();
  if (normalized === "url" || normalized === "image_url") return true;

  const loadNode = findContractNode(config.contractJson, config.loadImageNodeId);
  return normalized === "image" && loadNode?.class_type === "LoadImageFromUrl";
}

async function createSourceImageUrl(env: Env, sourceArtUrl: string): Promise<string> {
  const trimmed = sourceArtUrl.trim();
  if (!trimmed) {
    throw new ImageGenError("invalid_source_art_url", "source_art_url missing or invalid", {
      retryable: false,
    });
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new ImageGenError("invalid_source_art_url", "source_art_url missing or invalid", {
        retryable: false,
      });
    }
    const path = url.pathname.replace(/^\/+/, "");
    if (!path.startsWith("objects/") && !path.startsWith("api/objects/")) {
      return trimmed;
    }
  }

  try {
    return await createSignedObjectUrl(env, trimmed, { ttlSeconds: LOAD_IMAGE_URL_TTL_SECONDS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "invalid_source_art_url") {
      throw new ImageGenError("invalid_source_art_url", "source_art_url missing or invalid", {
        retryable: false,
      });
    }
    throw new ImageGenError("provider_not_configured", message, { retryable: false });
  }
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

/**
 * Append the anti-deformity negative prompt — only when the workflow declares a
 * negative text node. Without it the model keeps the source limbs and adds the
 * prompt's new gesture limbs, producing extra arms/hands and duplicate heads
 * ("三头六臂"). Applies to every RunningHub workflow that
 * wires a negative node.
 */
function appendNegativePrompt(nodeInfoList: NodeInfo[], config: WorkflowConfig): void {
  if (!config.negativePromptNodeId) return;
  nodeInfoList.push({
    fieldName: config.negativePromptFieldName || "prompt",
    fieldValue: ANATOMY_NEGATIVE,
    nodeId: config.negativePromptNodeId,
  });
}

function appendLora(nodeInfoList: NodeInfo[], config: WorkflowConfig, req: ImageGenRequest): void {
  const loraName = req.lora_name?.trim();
  if (!loraName) return;
  if (!config.loraNodeId) {
    throw new ImageGenError(
      "invalid_model_lora_combination",
      `RunningHub workflow "${config.key}" does not declare a LoRA node`,
      { retryable: false },
    );
  }
  nodeInfoList.push({
    fieldName: config.loraNameFieldName || "lora_name",
    fieldValue: loraName,
    nodeId: config.loraNodeId,
  });
  const modelStrength =
    typeof req.lora_model_strength === "number" && Number.isFinite(req.lora_model_strength)
      ? req.lora_model_strength
      : 1;
  nodeInfoList.push({
    fieldName: config.loraModelStrengthFieldName || "strength_model",
    fieldValue: modelStrength,
    nodeId: config.loraNodeId,
  });
  if (req.lora_clip_strength !== undefined && req.lora_clip_strength !== null) {
    if (!config.loraClipStrengthFieldName) {
      throw new ImageGenError(
        "workflow_contract_mismatch",
        `RunningHub workflow "${config.key}" does not declare a LoRA clip strength field`,
        { retryable: false },
      );
    }
    nodeInfoList.push({
      fieldName: config.loraClipStrengthFieldName,
      fieldValue: req.lora_clip_strength,
      nodeId: config.loraNodeId,
    });
  }
}

function appendGenerationParams(nodeInfoList: NodeInfo[], config: WorkflowConfig, req: ImageGenRequest): void {
  const values = req.generation_params;
  if (!values) return;
  const params = config.generationParams ?? parseWorkflowGenerationParams(config.generationParamsJson);
  if (!params) return;
  if (params.latentNodeId) {
    if (params.widthFieldName) {
      nodeInfoList.push({
        fieldName: params.widthFieldName,
        fieldValue: values.width,
        nodeId: params.latentNodeId,
      });
    }
    if (params.heightFieldName) {
      nodeInfoList.push({
        fieldName: params.heightFieldName,
        fieldValue: values.height,
        nodeId: params.latentNodeId,
      });
    }
    if (params.batchSizeFieldName) {
      nodeInfoList.push({
        fieldName: params.batchSizeFieldName,
        fieldValue: values.batch_size,
        nodeId: params.latentNodeId,
      });
    }
  }
  if (params.ksamplerNodeId && params.seedFieldName) {
    nodeInfoList.push({
      fieldName: params.seedFieldName,
      fieldValue: values.seed,
      nodeId: params.ksamplerNodeId,
    });
  }
}

async function submitTask(
  cfg: ImageGenConfig,
  config: WorkflowConfig,
  nodeInfoList: NodeInfo[],
  model: string,
): Promise<ImageGenResponse> {
  const apiKey = requireApiKey(cfg);
  const baseUrl = (cfg.runninghubBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const body = {
    apiKey,
    ...(config.instanceType ? { instanceType: config.instanceType } : {}),
    nodeInfoList,
    webhookUrl: cfg.webhookUrl ? buildWebhookUrl(cfg.webhookUrl, cfg.webhookSecret) : undefined,
    workflowId: config.workflowId,
  };
  validateNodeInfoList(config.workflowId, nodeInfoList, config);

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

async function readWorkflowConfig(
  env: Env,
  cfg: ImageGenConfig,
  key: string,
  options?: { promptRequired?: boolean },
): Promise<WorkflowConfig> {
  requireApiKey(cfg);
  const workflowKey = normalizeWorkflowKey(key) || key;
  const dbWorkflow = await getImageWorkflow(env, workflowKey).catch(() => null);
  const fallbackConfig = getWorkflowConfig(cfg.workflows, workflowKey);
  const config = dbWorkflow
    ? {
        checkpointFieldName: dbWorkflow.checkpoint_field_name || "ckpt_name",
        checkpointNodeId: dbWorkflow.checkpoint_node_id ?? undefined,
        key: dbWorkflow.key,
        label: dbWorkflow.label,
        loadImageFieldName: dbWorkflow.load_image_field_name || "image",
        loadImageNodeId: dbWorkflow.load_image_node_id ?? undefined,
        loraClipStrengthFieldName: dbWorkflow.lora_clip_strength_field_name ?? undefined,
        loraModelStrengthFieldName: dbWorkflow.lora_model_strength_field_name || "strength_model",
        loraNameFieldName: dbWorkflow.lora_name_field_name || "lora_name",
        loraNodeId: dbWorkflow.lora_node_id ?? undefined,
        generationParams: parseWorkflowGenerationParams(dbWorkflow.generation_params_json) ?? undefined,
        generationParamsJson: dbWorkflow.generation_params_json ?? undefined,
        mode: dbWorkflow.mode,
        negativePromptFieldName: dbWorkflow.negative_prompt_field_name || "prompt",
        negativePromptNodeId: dbWorkflow.negative_prompt_node_id ?? undefined,
        promptFieldName: dbWorkflow.prompt_field_name || "text",
        promptNodeId: dbWorkflow.prompt_node_id,
        contractHash: dbWorkflow.contract_hash ?? undefined,
        contractJson: dbWorkflow.contract_json ?? undefined,
        instanceType: fallbackConfig?.instanceType,
        workflowId: dbWorkflow.workflow_id,
      }
    : fallbackConfig;
  if (!config) {
    throw new ImageGenError(
      "provider_not_configured",
      `RunningHub workflow not configured: ${workflowKey}`,
      { retryable: false },
    );
  }
  const promptRequired = options?.promptRequired ?? true;
  if (!config.workflowId || (promptRequired && !config.promptNodeId)) {
    throw new ImageGenError(
      "provider_not_configured",
      promptRequired
        ? `RunningHub workflow "${workflowKey}" missing workflow id or prompt node id`
        : `RunningHub workflow "${workflowKey}" missing workflow id`,
      { retryable: false },
    );
  }
  return config;
}

function validateNodeInfoList(workflowId: string, nodeInfoList: NodeInfo[], config: WorkflowConfig): void {
  if (!config.contractJson) return;
  for (const nodeInfo of nodeInfoList) {
    if (!workflowContractHasField(config.contractJson, nodeInfo.nodeId, nodeInfo.fieldName)) {
      throw new ImageGenError(
        "workflow_contract_mismatch",
        `RunningHub workflow "${workflowId}" contract does not contain nodeId=${nodeInfo.nodeId}, fieldName=${nodeInfo.fieldName}`,
        { retryable: false },
      );
    }
  }
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
