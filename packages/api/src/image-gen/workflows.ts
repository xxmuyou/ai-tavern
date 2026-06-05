import type { ImageGenMode } from "./types";
import {
  normalizeWorkflowGenerationParams,
  type WorkflowGenerationParams,
} from "./generation-params";
import { normalizeWorkflowKey } from "./workflow-keys";

/**
 * Unified RunningHub workflow wiring (deployment-managed, admin-overridable).
 *
 * Legacy/fallback parser for the repo-managed `image_gen.workflows` JSON.
 * Runtime workflow management now lives in the `image_workflows` and
 * `image_workflow_models` tables, but this parser keeps old tests and
 * pre-migration deployments readable.
 *
 * Shape:
 *   {
 *     "portrait_create":   { "mode": "create",    "workflowId", "promptNodeId", "checkpointNodeId" },
 *     "profile_outfit":    { "mode": "variation", "workflowId", "promptNodeId", "loadImageNodeId", "loadImageFieldName" },
 *     "companion_cutout":  { "mode": "cutout",    "workflowId", "loadImageNodeId", "loadImageFieldName" }
 *   }
 */
export type WorkflowConfig = {
  key: string;
  label?: string;
  architecture?: string;
  mode: ImageGenMode;
  workflowId: string;
  promptNodeId: string;
  /** Field name on the prompt node. Source of truth is the workflow contract. */
  promptFieldName?: string;
  /** create mode: node where the model's checkpoint override is injected. */
  checkpointNodeId?: string;
  /** create mode: field on the checkpoint node. Source of truth is the workflow contract. */
  checkpointFieldName?: string;
  /** variation mode: node that loads the source image. */
  loadImageNodeId?: string;
  /** Field on the load-image node. Source of truth is the workflow contract. */
  loadImageFieldName?: string;
  /** variation mode: optional negative-prompt text node (anti-deformity). */
  negativePromptNodeId?: string;
  /** Field name on the negative-prompt node. Defaults to "prompt". */
  negativePromptFieldName?: string;
  /** Compact parsed RunningHub API contract JSON. */
  contractJson?: string;
  contractHash?: string;
  /** Optional LoRA loader node. First implementation supports at most one LoRA. */
  loraNodeId?: string;
  loraNameFieldName?: string;
  loraModelStrengthFieldName?: string;
  loraClipStrengthFieldName?: string;
  generationParams?: WorkflowGenerationParams;
  generationParamsJson?: string;
  /** Checkpoint ids enabled for this workflow by config seed. */
  modelIds?: string[];
};

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

export function isImageGenMode(value: unknown): value is ImageGenMode {
  return value === "create" || value === "variation" || value === "cutout";
}

/** Parse the raw `image_gen.workflows` JSON. Never throws (returns {} on bad input). */
export function parseWorkflows(raw: string | null | undefined): Record<string, WorkflowConfig> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const out: Record<string, WorkflowConfig> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const workflowKey = normalizeWorkflowKey(key) || key;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const workflowId = str(entry.workflowId);
    const promptNodeId = str(entry.promptNodeId);
    const mode: ImageGenMode = isImageGenMode(entry.mode) ? entry.mode : "create";
    if (!workflowId || (mode !== "cutout" && !promptNodeId)) continue;
    out[workflowKey] = {
      key: workflowKey,
      architecture: str(entry.architecture) || "sdxl",
      label: str(entry.label) || undefined,
      mode,
      workflowId,
      promptNodeId,
      promptFieldName: str(entry.promptFieldName) || "text",
      checkpointNodeId: str(entry.checkpointNodeId) || undefined,
      checkpointFieldName: str(entry.checkpointFieldName) || "ckpt_name",
      loadImageNodeId: str(entry.loadImageNodeId) || undefined,
      loadImageFieldName: str(entry.loadImageFieldName) || "image",
      negativePromptNodeId: str(entry.negativePromptNodeId) || undefined,
      negativePromptFieldName: str(entry.negativePromptFieldName) || "prompt",
      contractHash: str(entry.contractHash) || undefined,
      contractJson: str(entry.contractJson) || undefined,
      loraClipStrengthFieldName: str(entry.loraClipStrengthFieldName) || undefined,
      loraModelStrengthFieldName: str(entry.loraModelStrengthFieldName) || "strength_model",
      loraNameFieldName: str(entry.loraNameFieldName) || "lora_name",
      loraNodeId: str(entry.loraNodeId) || undefined,
      generationParams:
        entry.generationParams && typeof entry.generationParams === "object" && !Array.isArray(entry.generationParams)
          ? normalizeWorkflowGenerationParams(entry.generationParams)
          : undefined,
      generationParamsJson:
        entry.generationParams && typeof entry.generationParams === "object" && !Array.isArray(entry.generationParams)
          ? JSON.stringify(normalizeWorkflowGenerationParams(entry.generationParams))
          : undefined,
      modelIds: Array.isArray(entry.modelIds)
        ? entry.modelIds.map((id) => str(id)).filter(Boolean)
        : undefined,
    };
  }
  return out;
}

export function getWorkflowConfig(
  raw: string | null | undefined,
  key: string,
): WorkflowConfig | null {
  const workflowKey = normalizeWorkflowKey(key) || key;
  return parseWorkflows(raw)[workflowKey] ?? null;
}

/**
 * Does the workflow for `key` declare a checkpoint node? When it does not, a
 * model's `ckpt_name` is silently ignored at generation time (the workflow's
 * built-in checkpoint is used). The admin workspace surfaces this as a warning.
 */
export function workflowHasCheckpointNode(
  raw: string | null | undefined,
  key: string,
): boolean {
  return Boolean(getWorkflowConfig(raw, key)?.checkpointNodeId);
}
