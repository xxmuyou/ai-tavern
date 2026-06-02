import type { ImageGenMode } from "./types";

/**
 * Unified RunningHub workflow wiring (deployment-managed, admin-overridable).
 *
 * Stored as a single JSON object under `image_gen.workflows`, keyed by an
 * arbitrary workflow key (e.g. `wf1`, `wf2`). Each entry declares its product
 * `mode` and the RunningHub node ids to override at submit time. Checkpoints are
 * NOT configured here — they live on the model catalog (`image_models`), which
 * references a workflow via `workflow_key`. See spec-022.
 *
 * Shape:
 *   {
 *     "wf1": { "mode": "create",    "workflowId", "promptNodeId", "checkpointNodeId" },
 *     "wf2": { "mode": "variation", "workflowId", "promptNodeId", "loadImageNodeId" }
 *   }
 */
export type WorkflowConfig = {
  key: string;
  mode: ImageGenMode;
  workflowId: string;
  promptNodeId: string;
  /** create mode: node where the model's checkpoint override is injected. */
  checkpointNodeId?: string;
  /** variation mode: node that loads the source image. */
  loadImageNodeId?: string;
};

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
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
    if (!workflowId || !promptNodeId) continue;
    const mode: ImageGenMode = entry.mode === "variation" ? "variation" : "create";
    out[key] = {
      key,
      mode,
      workflowId,
      promptNodeId,
      checkpointNodeId: str(entry.checkpointNodeId) || undefined,
      loadImageNodeId: str(entry.loadImageNodeId) || undefined,
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
