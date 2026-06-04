import type { ImageGenMode } from "./types";

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
 *     "wf1":       { "mode": "create",    "workflowId", "promptNodeId", "checkpointNodeId" },
 *     "wf_outfit": { "mode": "variation", "workflowId", "promptNodeId", "loadImageNodeId" },
 *     "wf_cutout": { "mode": "cutout",    "workflowId", "loadImageNodeId" }
 *   }
 */
export type WorkflowConfig = {
  key: string;
  label?: string;
  mode: ImageGenMode;
  workflowId: string;
  promptNodeId: string;
  /** Field name on the prompt node. Defaults to "text" (CLIPTextEncode); Qwen
   * image-edit nodes (TextEncodeQwenImageEditPlus) use "prompt". */
  promptFieldName?: string;
  /** create mode: node where the model's checkpoint override is injected. */
  checkpointNodeId?: string;
  /** create mode: field on the checkpoint node. Defaults to ckpt_name. */
  checkpointFieldName?: string;
  /** variation mode: node that loads the source image. */
  loadImageNodeId?: string;
  /** variation mode: optional negative-prompt text node (anti-deformity). */
  negativePromptNodeId?: string;
  /** Field name on the negative-prompt node. Defaults to "prompt". */
  negativePromptFieldName?: string;
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
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const workflowId = str(entry.workflowId);
    const promptNodeId = str(entry.promptNodeId);
    const mode: ImageGenMode = isImageGenMode(entry.mode) ? entry.mode : "create";
    if (!workflowId || (mode !== "cutout" && !promptNodeId)) continue;
    out[key] = {
      key,
      label: str(entry.label) || undefined,
      mode,
      workflowId,
      promptNodeId,
      promptFieldName: str(entry.promptFieldName) || "text",
      checkpointNodeId: str(entry.checkpointNodeId) || undefined,
      checkpointFieldName: str(entry.checkpointFieldName) || "ckpt_name",
      loadImageNodeId: str(entry.loadImageNodeId) || undefined,
      negativePromptNodeId: str(entry.negativePromptNodeId) || undefined,
      negativePromptFieldName: str(entry.negativePromptFieldName) || "prompt",
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
  return parseWorkflows(raw)[key] ?? null;
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
