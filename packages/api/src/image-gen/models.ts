import {
  parseWorkflowGenerationParams,
  type WorkflowGenerationParams,
} from "./generation-params";
import type { ImageGenMode } from "./types";
import { normalizeWorkflowKey } from "./workflow-keys";

/**
 * RunningHub checkpoint catalog + workflow bindings.
 *
 * Checkpoints/models are reusable catalog entries. Workflow node wiring and the
 * checkpoint field name live on image_workflows; image_workflow_models decides
 * which checkpoints each workflow offers. The legacy image_models.workflow_key
 * and checkpoint_field_name columns may still exist after migrations, but new
 * code does not read them.
 */
export type ImageModelRow = {
  id: string;
  label: string;
  tag: string;
  ckpt_name: string;
  architecture: string;
  style_family: string;
  purpose: string;
  tags: string;
  is_active: number;
  sort_order: number;
  updated_at: number;
  updated_by: string | null;
};

export type ImageModel = {
  id: string;
  label: string;
  tag: string;
  ckpt_name: string;
  architecture: string;
  style_family: string;
  purpose: string;
  tags: string;
};

export type ImageModelInput = {
  label: string;
  tag: string;
  ckpt_name: string;
  architecture?: string;
  style_family?: string;
  purpose?: string;
  tags?: string;
  is_active: boolean;
  sort_order: number;
};

export type ImageLoraRow = {
  id: string;
  label: string;
  lora_name: string;
  architecture: string;
  style_family: string;
  purpose: string;
  tags: string;
  default_model_strength: number;
  default_clip_strength: number | null;
  is_active: number;
  sort_order: number;
  updated_at: number;
  updated_by: string | null;
};

export type ImageLora = {
  id: string;
  label: string;
  lora_name: string;
  default_model_strength: number;
  default_clip_strength: number | null;
};

export type ImageLoraInput = {
  label: string;
  lora_name: string;
  architecture?: string;
  style_family?: string;
  purpose?: string;
  tags?: string;
  default_model_strength: number;
  default_clip_strength: number | null;
  is_active: boolean;
  sort_order: number;
};

export type ImageWorkflowRow = {
  key: string;
  label: string;
  architecture: string;
  mode: ImageGenMode;
  workflow_id: string;
  prompt_node_id: string;
  prompt_field_name: string;
  checkpoint_node_id: string | null;
  checkpoint_field_name: string;
  load_image_node_id: string | null;
  load_image_field_name: string;
  negative_prompt_node_id: string | null;
  negative_prompt_field_name: string;
  contract_json: string | null;
  contract_hash: string | null;
  contract_refreshed_at: number | null;
  lora_node_id: string | null;
  lora_name_field_name: string;
  lora_model_strength_field_name: string;
  lora_clip_strength_field_name: string | null;
  generation_params_json: string | null;
  is_active: number;
  sort_order: number;
  updated_at: number;
  updated_by: string | null;
};

export type ImageWorkflow = {
  key: string;
  label: string;
  architecture: string;
  mode: ImageGenMode;
  workflow_id: string;
  prompt_node_id: string;
  prompt_field_name: string;
  checkpoint_node_id: string | null;
  checkpoint_field_name: string;
  load_image_node_id: string | null;
  load_image_field_name: string;
  negative_prompt_node_id: string | null;
  negative_prompt_field_name: string;
  contract_json: string | null;
  contract_hash: string | null;
  contract_refreshed_at: number | null;
  lora_node_id: string | null;
  lora_name_field_name: string;
  lora_model_strength_field_name: string;
  lora_clip_strength_field_name: string | null;
  generation_params_json: string | null;
  is_active: boolean;
  sort_order: number;
};

export type ImageWorkflowInput = {
  key: string;
  label: string;
  architecture?: string;
  mode: ImageGenMode;
  workflow_id: string;
  prompt_node_id: string;
  prompt_field_name: string | null;
  checkpoint_node_id: string | null;
  checkpoint_field_name: string | null;
  load_image_node_id: string | null;
  load_image_field_name: string | null;
  negative_prompt_node_id: string | null;
  negative_prompt_field_name: string | null;
  contract_json?: string | null;
  contract_hash?: string | null;
  contract_refreshed_at?: number | null;
  lora_node_id: string | null;
  lora_name_field_name: string | null;
  lora_model_strength_field_name: string | null;
  lora_clip_strength_field_name: string | null;
  generation_params_json?: string | null;
  model_ids: string[];
  lora_bindings?: ImageWorkflowLoraBindingInput[];
  is_active: boolean;
  sort_order: number;
};

export type ImageWorkflowLoraBindingInput = {
  model_id: string;
  lora_ids: string[];
};

export type ImageWorkflowLoraBinding = {
  model_id: string;
  lora_ids: string[];
};

export type ImageWorkflowWithModels = ImageWorkflow & {
  model_ids: string[];
  lora_bindings: ImageWorkflowLoraBinding[];
  updated_at: number;
  updated_by: string | null;
};

export type ImageModelOption = {
  id: string;
  workflow_key: string;
  workflow_label: string;
  model_id: string;
  label: string;
  tag: string;
  ckpt_name: string;
  checkpoint_applies: boolean;
  generation_controls: WorkflowGenerationParams | null;
  loras: ImageLoraSelection[];
};

export type ImageModelSelection = {
  option_id: string;
  workflow: ImageWorkflow;
  model: ImageModel;
};

export type ImageLoraSelection = {
  id: string;
  label: string;
  lora_name: string;
  model_strength: number;
  clip_strength: number | null;
};

const COLUMNS =
  "id, label, tag, ckpt_name, architecture, style_family, purpose, tags, is_active, sort_order, updated_at, updated_by";
const LORA_COLUMNS =
  "id, label, lora_name, architecture, style_family, purpose, tags, default_model_strength, default_clip_strength, is_active, sort_order, updated_at, updated_by";
const WORKFLOW_COLUMNS =
  "key, label, architecture, mode, workflow_id, prompt_node_id, prompt_field_name, checkpoint_node_id, checkpoint_field_name, load_image_node_id, load_image_field_name, negative_prompt_node_id, negative_prompt_field_name, contract_json, contract_hash, contract_refreshed_at, lora_node_id, lora_name_field_name, lora_model_strength_field_name, lora_clip_strength_field_name, generation_params_json, is_active, sort_order, updated_at, updated_by";
const ASSET_LANES = new Set(["anime", "realistic"]);
export const BASE_ARCHITECTURES = ["sdxl", "sd15", "ilxl", "flux1"] as const;
const BASE_ARCHITECTURE_SET = new Set<string>(BASE_ARCHITECTURES);

function toImageModel(row: ImageModelRow): ImageModel {
  return {
    id: row.id,
    label: row.label,
    tag: row.tag,
    ckpt_name: row.ckpt_name,
    architecture: row.architecture || "",
    purpose: row.purpose || "",
    style_family: row.style_family || "",
    tags: row.tags || row.tag || "",
  };
}

function toImageLora(row: ImageLoraRow): ImageLora {
  return {
    default_clip_strength: row.default_clip_strength ?? null,
    default_model_strength: row.default_model_strength,
    id: row.id,
    label: row.label,
    lora_name: row.lora_name,
  };
}

function toImageWorkflow(row: ImageWorkflowRow): ImageWorkflow {
  return {
    architecture: row.architecture || "sdxl",
    checkpoint_field_name: row.checkpoint_field_name || "ckpt_name",
    checkpoint_node_id: row.checkpoint_node_id,
    contract_hash: row.contract_hash ?? null,
    contract_json: row.contract_json ?? null,
    contract_refreshed_at: row.contract_refreshed_at ?? null,
    is_active: row.is_active === 1,
    key: row.key,
    label: row.label,
    load_image_field_name: row.load_image_field_name || "image",
    load_image_node_id: row.load_image_node_id,
    lora_clip_strength_field_name: row.lora_clip_strength_field_name || null,
    lora_model_strength_field_name: row.lora_model_strength_field_name || "strength_model",
    lora_name_field_name: row.lora_name_field_name || "lora_name",
    lora_node_id: row.lora_node_id,
    generation_params_json: row.generation_params_json ?? null,
    mode: row.mode,
    negative_prompt_field_name: row.negative_prompt_field_name || "prompt",
    negative_prompt_node_id: row.negative_prompt_node_id,
    prompt_field_name: row.prompt_field_name || "text",
    prompt_node_id: row.prompt_node_id,
    sort_order: row.sort_order,
    workflow_id: row.workflow_id,
  };
}

export function imageModelOptionId(workflowKey: string, modelId: string): string {
  return `${normalizeWorkflowKey(workflowKey) || workflowKey}::${modelId}`;
}

function splitOptionId(id: string): { workflowKey: string; modelId: string } | null {
  const idx = id.indexOf("::");
  if (idx <= 0 || idx === id.length - 2) return null;
  return { workflowKey: normalizeWorkflowKey(id.slice(0, idx)), modelId: id.slice(idx + 2) };
}

/** Active workflow/checkpoint options, ordered for the public create form. */
export async function listActiveImageModels(env: Env): Promise<ImageModelOption[]> {
  return listActiveImageModelOptions(env);
}

export async function listActiveImageModelOptions(env: Env): Promise<ImageModelOption[]> {
  const { results } = await env.DB.prepare(
    `SELECT
       w.key AS workflow_key,
       w.label AS workflow_label,
       w.checkpoint_node_id AS checkpoint_node_id,
       w.generation_params_json AS generation_params_json,
       m.id AS model_id,
       m.label AS label,
       m.tag AS tag,
       m.ckpt_name AS ckpt_name
     FROM image_workflow_models wm
     JOIN image_workflows w ON w.key = wm.workflow_key
     JOIN image_models m ON m.id = wm.model_id
     WHERE wm.is_active = 1
       AND w.is_active = 1
       AND m.is_active = 1
       AND w.architecture = m.architecture
       AND w.mode = 'create'
     ORDER BY w.sort_order ASC, wm.sort_order ASC, m.sort_order ASC, m.label ASC`,
  ).all<{
    workflow_key: string;
    workflow_label: string;
    checkpoint_node_id: string | null;
    generation_params_json: string | null;
    model_id: string;
    label: string;
    tag: string;
    ckpt_name: string;
  }>();

  const loraOptions = await listActiveLoraOptionsForModelOptions(env);

  return (results ?? []).map((row) => ({
    checkpoint_applies: Boolean(row.checkpoint_node_id?.trim()),
    ckpt_name: row.ckpt_name,
    generation_controls: parseWorkflowGenerationParams(row.generation_params_json),
    id: imageModelOptionId(row.workflow_key, row.model_id),
    label: row.workflow_label ? `${row.label} · ${row.workflow_label}` : row.label,
    loras: loraOptions.get(imageModelOptionId(row.workflow_key, row.model_id)) ?? [],
    model_id: row.model_id,
    tag: row.tag,
    workflow_key: row.workflow_key,
    workflow_label: row.workflow_label,
  }));
}

async function listActiveLoraOptionsForModelOptions(env: Env): Promise<Map<string, ImageLoraSelection[]>> {
  const { results } = await env.DB.prepare(
    `SELECT
       wml.workflow_key AS workflow_key,
       wml.model_id AS model_id,
       l.id AS id,
       l.label AS label,
       l.lora_name AS lora_name,
       l.default_model_strength AS default_model_strength,
       l.default_clip_strength AS default_clip_strength
     FROM image_workflow_model_loras wml
     JOIN image_loras l ON l.id = wml.lora_id
     JOIN image_workflow_models wm
       ON wm.workflow_key = wml.workflow_key AND wm.model_id = wml.model_id
     JOIN image_workflows w ON w.key = wml.workflow_key
     JOIN image_models m ON m.id = wml.model_id
     WHERE wml.is_active = 1
       AND wm.is_active = 1
       AND w.is_active = 1
       AND m.is_active = 1
       AND l.is_active = 1
       AND w.mode = 'create'
       AND w.architecture = m.architecture
       AND l.architecture = m.architecture
       AND l.style_family = m.style_family
     ORDER BY wml.workflow_key ASC, wml.model_id ASC, wml.sort_order ASC, l.sort_order ASC, l.label ASC`,
  ).all<{
    workflow_key: string;
    model_id: string;
    id: string;
    label: string;
    lora_name: string;
    default_model_strength: number;
    default_clip_strength: number | null;
  }>();
  const byOption = new Map<string, ImageLoraSelection[]>();
  for (const row of results ?? []) {
    const optionId = imageModelOptionId(row.workflow_key, row.model_id);
    const loras = byOption.get(optionId) ?? [];
    loras.push({
      clip_strength: row.default_clip_strength ?? null,
      id: row.id,
      label: row.label,
      lora_name: row.lora_name,
      model_strength: row.default_model_strength,
    });
    byOption.set(optionId, loras);
  }
  return byOption;
}

/** Every model (active or not) for the admin workspace. */
export async function listImageModelRows(env: Env): Promise<ImageModelRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM image_models ORDER BY sort_order ASC, label ASC`,
  ).all<ImageModelRow>();
  return results ?? [];
}

export async function listImageLoraRows(env: Env): Promise<ImageLoraRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${LORA_COLUMNS} FROM image_loras ORDER BY sort_order ASC, label ASC`,
  ).all<ImageLoraRow>();
  return results ?? [];
}

export async function getImageModel(env: Env, id: string): Promise<ImageModel | null> {
  const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM image_models WHERE id = ?`)
    .bind(id)
    .first<ImageModelRow>();
  return row ? toImageModel(row) : null;
}

export async function getImageLora(env: Env, id: string): Promise<ImageLora | null> {
  const row = await env.DB.prepare(`SELECT ${LORA_COLUMNS} FROM image_loras WHERE id = ?`)
    .bind(id)
    .first<ImageLoraRow>();
  return row ? toImageLora(row) : null;
}

export async function getImageModelSelection(env: Env, id: string): Promise<ImageModelSelection | null> {
  const parsed = splitOptionId(id);
  if (parsed) {
    return getSelectionByWorkflowAndModel(env, parsed.workflowKey, parsed.modelId);
  }

  // Legacy compatibility: older clients sent the bare image_models.id. Pick the
  // first active binding for that checkpoint.
  const { results } = await env.DB.prepare(
    `SELECT wm.workflow_key
     FROM image_workflow_models wm
     JOIN image_workflows w ON w.key = wm.workflow_key
     JOIN image_models m ON m.id = wm.model_id
     WHERE wm.model_id = ?
       AND wm.is_active = 1
       AND w.is_active = 1
       AND m.is_active = 1
       AND w.architecture = m.architecture
       AND w.mode = 'create'
     ORDER BY w.sort_order ASC, wm.sort_order ASC
     LIMIT 1`,
  )
    .bind(id)
    .all<{ workflow_key: string }>();
  const workflowKey = results?.[0]?.workflow_key;
  return workflowKey ? getSelectionByWorkflowAndModel(env, workflowKey, id) : null;
}

async function getSelectionByWorkflowAndModel(
  env: Env,
  workflowKey: string,
  modelId: string,
): Promise<ImageModelSelection | null> {
  const row = await env.DB.prepare(
    `SELECT
       w.${WORKFLOW_COLUMNS.replaceAll(", ", ", w.")},
       m.id AS model_id,
       m.label AS model_label,
       m.tag AS model_tag,
       m.ckpt_name AS model_ckpt_name,
       m.architecture AS model_architecture,
       m.style_family AS model_style_family,
       m.purpose AS model_purpose,
       m.tags AS model_tags
     FROM image_workflow_models wm
     JOIN image_workflows w ON w.key = wm.workflow_key
     JOIN image_models m ON m.id = wm.model_id
     WHERE wm.workflow_key = ?
       AND wm.model_id = ?
       AND wm.is_active = 1
       AND w.is_active = 1
       AND m.is_active = 1
       AND w.architecture = m.architecture
       AND w.mode = 'create'
     LIMIT 1`,
  )
    .bind(workflowKey, modelId)
    .first<ImageWorkflowRow & {
      model_id: string;
      model_label: string;
      model_tag: string;
      model_ckpt_name: string;
      model_architecture: string;
      model_style_family: string;
      model_purpose: string;
      model_tags: string;
    }>();
  if (!row) return null;

  return {
    model: {
      architecture: row.model_architecture || "",
      ckpt_name: row.model_ckpt_name,
      id: row.model_id,
      label: row.model_label,
      purpose: row.model_purpose || "",
      style_family: row.model_style_family || "",
      tag: row.model_tag,
      tags: row.model_tags || row.model_tag || "",
    },
    option_id: imageModelOptionId(workflowKey, modelId),
    workflow: toImageWorkflow(row),
  };
}

export async function createImageModel(
  env: Env,
  id: string,
  input: ImageModelInput,
  updatedBy: string,
): Promise<void> {
  const now = Date.now();
  const tag = normalizeLaneList(input.tag, "checkpoint tag", { required: true });
  const architecture = normalizeArchitecture(input.architecture, "checkpoint architecture", { required: true });
  const styleFamily = normalizeLane(input.style_family, "checkpoint style_family");
  const tags = normalizeLaneList(input.tags ?? input.tag, "checkpoint tags");
  await env.DB.prepare(
    `INSERT INTO image_models
       (id, label, tag, ckpt_name, architecture, style_family, purpose, tags,
        is_active, sort_order, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.label,
      tag,
      input.ckpt_name,
      architecture,
      styleFamily,
      input.purpose ?? "",
      tags,
      input.is_active ? 1 : 0,
      input.sort_order,
      now,
      updatedBy,
    )
    .run();
}

export async function updateImageModel(
  env: Env,
  id: string,
  input: ImageModelInput,
  updatedBy: string,
): Promise<void> {
  const now = Date.now();
  const tag = normalizeLaneList(input.tag, "checkpoint tag", { required: true });
  const architecture = normalizeArchitecture(input.architecture, "checkpoint architecture", { required: true });
  const styleFamily = normalizeLane(input.style_family, "checkpoint style_family");
  const tags = normalizeLaneList(input.tags ?? input.tag, "checkpoint tags");
  await env.DB.prepare(
    `UPDATE image_models
     SET label = ?, tag = ?, ckpt_name = ?, architecture = ?, style_family = ?, purpose = ?,
         tags = ?, is_active = ?, sort_order = ?, updated_at = ?, updated_by = ?
     WHERE id = ?`,
  )
    .bind(
      input.label,
      tag,
      input.ckpt_name,
      architecture,
      styleFamily,
      input.purpose ?? "",
      tags,
      input.is_active ? 1 : 0,
      input.sort_order,
      now,
      updatedBy,
      id,
    )
    .run();
}

export async function deleteImageModel(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM image_models WHERE id = ?`).bind(id).run();
}

export async function createImageLora(
  env: Env,
  id: string,
  input: ImageLoraInput,
  updatedBy: string,
): Promise<void> {
  const now = Date.now();
  const architecture = normalizeArchitecture(input.architecture, "LoRA architecture", { required: true });
  const styleFamily = normalizeLane(input.style_family, "LoRA style_family");
  const tags = normalizeLaneList(input.tags ?? input.style_family ?? "", "LoRA tags");
  await env.DB.prepare(
    `INSERT INTO image_loras
       (id, label, lora_name, architecture, style_family, purpose, tags,
        default_model_strength, default_clip_strength, is_active, sort_order, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.label,
      input.lora_name,
      architecture,
      styleFamily,
      input.purpose ?? "",
      tags,
      input.default_model_strength,
      input.default_clip_strength,
      input.is_active ? 1 : 0,
      input.sort_order,
      now,
      updatedBy,
    )
    .run();
}

export async function updateImageLora(
  env: Env,
  id: string,
  input: ImageLoraInput,
  updatedBy: string,
): Promise<void> {
  const now = Date.now();
  const architecture = normalizeArchitecture(input.architecture, "LoRA architecture", { required: true });
  const styleFamily = normalizeLane(input.style_family, "LoRA style_family");
  const tags = normalizeLaneList(input.tags ?? input.style_family ?? "", "LoRA tags");
  await env.DB.prepare(
    `UPDATE image_loras
     SET label = ?, lora_name = ?, architecture = ?, style_family = ?, purpose = ?, tags = ?,
         default_model_strength = ?, default_clip_strength = ?, is_active = ?, sort_order = ?,
         updated_at = ?, updated_by = ?
     WHERE id = ?`,
  )
    .bind(
      input.label,
      input.lora_name,
      architecture,
      styleFamily,
      input.purpose ?? "",
      tags,
      input.default_model_strength,
      input.default_clip_strength,
      input.is_active ? 1 : 0,
      input.sort_order,
      now,
      updatedBy,
      id,
    )
    .run();
}

export async function deleteImageLora(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM image_loras WHERE id = ?`).bind(id).run();
}

export async function listImageWorkflowRows(env: Env): Promise<ImageWorkflowWithModels[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${WORKFLOW_COLUMNS} FROM image_workflows ORDER BY sort_order ASC, key ASC`,
  ).all<ImageWorkflowRow>();
  const workflows = results ?? [];
  if (workflows.length === 0) return [];

  const { results: bindings } = await env.DB.prepare(
    `SELECT workflow_key, model_id
     FROM image_workflow_models
     WHERE is_active = 1
     ORDER BY sort_order ASC, model_id ASC`,
  ).all<{ workflow_key: string; model_id: string }>();
  const modelIdsByWorkflow = new Map<string, string[]>();
  for (const binding of bindings ?? []) {
    const ids = modelIdsByWorkflow.get(binding.workflow_key) ?? [];
    ids.push(binding.model_id);
    modelIdsByWorkflow.set(binding.workflow_key, ids);
  }

  const { results: loraBindings } = await env.DB.prepare(
    `SELECT workflow_key, model_id, lora_id
     FROM image_workflow_model_loras
     WHERE is_active = 1
     ORDER BY sort_order ASC, lora_id ASC`,
  ).all<{ workflow_key: string; model_id: string; lora_id: string }>();
  const loraBindingsByWorkflow = new Map<string, Map<string, string[]>>();
  for (const binding of loraBindings ?? []) {
    const byModel = loraBindingsByWorkflow.get(binding.workflow_key) ?? new Map<string, string[]>();
    const ids = byModel.get(binding.model_id) ?? [];
    ids.push(binding.lora_id);
    byModel.set(binding.model_id, ids);
    loraBindingsByWorkflow.set(binding.workflow_key, byModel);
  }

  return workflows.map((row) => ({
    ...toImageWorkflow(row),
    lora_bindings: [...(loraBindingsByWorkflow.get(row.key)?.entries() ?? [])].map(([modelId, loraIds]) => ({
      lora_ids: loraIds,
      model_id: modelId,
    })),
    model_ids: modelIdsByWorkflow.get(row.key) ?? [],
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  }));
}

export async function getImageWorkflow(env: Env, key: string): Promise<ImageWorkflow | null> {
  const workflowKey = normalizeWorkflowKey(key) || key;
  const row = await env.DB.prepare(`SELECT ${WORKFLOW_COLUMNS} FROM image_workflows WHERE key = ?`)
    .bind(workflowKey)
    .first<ImageWorkflowRow>();
  return row ? toImageWorkflow(row) : null;
}

export async function upsertImageWorkflow(
  env: Env,
  input: ImageWorkflowInput,
  updatedBy: string | null,
): Promise<void> {
  const now = Date.now();
  const workflowKey = normalizeWorkflowKey(input.key) || input.key;
  const architecture = normalizeArchitecture(input.architecture, "workflow architecture", { required: true });
  const checkpointFieldName = input.checkpoint_field_name?.trim() || "ckpt_name";
  const promptFieldName = input.prompt_field_name?.trim() || "text";
  const loadImageFieldName = input.load_image_field_name?.trim() || "image";
  const negativePromptFieldName = input.negative_prompt_field_name?.trim() || "prompt";
  const loraNameFieldName = input.lora_name_field_name?.trim() || "lora_name";
  const loraModelStrengthFieldName = input.lora_model_strength_field_name?.trim() || "strength_model";
  const loraClipStrengthFieldName = input.lora_clip_strength_field_name?.trim() || null;
  const generationParamsJson = input.generation_params_json?.trim() || null;
  const loraBindings = normalizeLoraBindings(input.lora_bindings ?? [], input.model_ids);
  await validateWorkflowAssetBindings(env, {
    architecture,
    loraBindings,
    modelIds: input.model_ids,
    workflowKey,
  });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO image_workflows
         (key, label, architecture, mode, workflow_id, prompt_node_id, prompt_field_name, checkpoint_node_id,
          checkpoint_field_name, load_image_node_id, load_image_field_name,
          negative_prompt_node_id, negative_prompt_field_name, contract_json, contract_hash,
          contract_refreshed_at, lora_node_id, lora_name_field_name, lora_model_strength_field_name,
          lora_clip_strength_field_name, generation_params_json, is_active, sort_order, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         label = excluded.label,
         architecture = excluded.architecture,
         mode = excluded.mode,
         workflow_id = excluded.workflow_id,
         prompt_node_id = excluded.prompt_node_id,
         prompt_field_name = excluded.prompt_field_name,
         checkpoint_node_id = excluded.checkpoint_node_id,
         checkpoint_field_name = excluded.checkpoint_field_name,
         load_image_node_id = excluded.load_image_node_id,
         load_image_field_name = excluded.load_image_field_name,
         negative_prompt_node_id = excluded.negative_prompt_node_id,
         negative_prompt_field_name = excluded.negative_prompt_field_name,
         contract_json = excluded.contract_json,
         contract_hash = excluded.contract_hash,
         contract_refreshed_at = excluded.contract_refreshed_at,
         lora_node_id = excluded.lora_node_id,
         lora_name_field_name = excluded.lora_name_field_name,
         lora_model_strength_field_name = excluded.lora_model_strength_field_name,
         lora_clip_strength_field_name = excluded.lora_clip_strength_field_name,
         generation_params_json = excluded.generation_params_json,
         is_active = excluded.is_active,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    ).bind(
      workflowKey,
      input.label,
      architecture,
      input.mode,
      input.workflow_id,
      input.prompt_node_id,
      promptFieldName,
      input.checkpoint_node_id,
      checkpointFieldName,
      input.load_image_node_id,
      loadImageFieldName,
      input.negative_prompt_node_id,
      negativePromptFieldName,
      input.contract_json ?? null,
      input.contract_hash ?? null,
      input.contract_refreshed_at ?? null,
      input.lora_node_id,
      loraNameFieldName,
      loraModelStrengthFieldName,
      loraClipStrengthFieldName,
      generationParamsJson,
      input.is_active ? 1 : 0,
      input.sort_order,
      now,
      updatedBy,
    ),
    env.DB.prepare(`DELETE FROM image_workflow_models WHERE workflow_key = ?`).bind(workflowKey),
    env.DB.prepare(`DELETE FROM image_workflow_model_loras WHERE workflow_key = ?`).bind(workflowKey),
    ...input.model_ids.map((modelId, index) =>
      env.DB.prepare(
        `INSERT INTO image_workflow_models
           (workflow_key, model_id, is_active, sort_order, updated_at, updated_by)
         VALUES (?, ?, 1, ?, ?, ?)`,
      ).bind(workflowKey, modelId, index + 1, now, updatedBy),
    ),
    ...loraBindings.flatMap((binding) =>
      binding.lora_ids.map((loraId, index) =>
        env.DB.prepare(
          `INSERT INTO image_workflow_model_loras
             (workflow_key, model_id, lora_id, is_active, sort_order, updated_at, updated_by)
           VALUES (?, ?, ?, 1, ?, ?, ?)`,
        ).bind(workflowKey, binding.model_id, loraId, index + 1, now, updatedBy),
      ),
    ),
  ]);
}

export async function deleteImageWorkflow(env: Env, key: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM image_workflows WHERE key = ?`).bind(normalizeWorkflowKey(key) || key).run();
}

export async function resolveImageLoraSelection(
  env: Env,
  input: { workflowKey: string; modelId: string; loraId: string },
): Promise<ImageLoraSelection | null> {
  const workflowKey = normalizeWorkflowKey(input.workflowKey) || input.workflowKey;
  const row = await env.DB.prepare(
    `SELECT l.id, l.label, l.lora_name, l.default_model_strength, l.default_clip_strength
     FROM image_workflow_model_loras wml
     JOIN image_loras l ON l.id = wml.lora_id
     JOIN image_workflow_models wm
       ON wm.workflow_key = wml.workflow_key AND wm.model_id = wml.model_id
     JOIN image_workflows w ON w.key = wml.workflow_key
     JOIN image_models m ON m.id = wml.model_id
     WHERE wml.workflow_key = ?
       AND wml.model_id = ?
       AND wml.lora_id = ?
       AND wml.is_active = 1
       AND wm.is_active = 1
       AND l.is_active = 1
       AND w.is_active = 1
       AND m.is_active = 1
       AND w.architecture = m.architecture
       AND l.architecture = m.architecture
       AND l.style_family = m.style_family
     LIMIT 1`,
  )
    .bind(workflowKey, input.modelId, input.loraId)
    .first<{
      id: string;
      label: string;
      lora_name: string;
      default_model_strength: number;
      default_clip_strength: number | null;
    }>();
  if (!row) return null;
  return {
    clip_strength: row.default_clip_strength ?? null,
    id: row.id,
    label: row.label,
    lora_name: row.lora_name,
    model_strength: row.default_model_strength,
  };
}

type AssetBindingModel = {
  id: string;
  architecture: string;
  style_family: string;
};

type AssetBindingLora = {
  id: string;
  architecture: string;
  style_family: string;
};

async function validateWorkflowAssetBindings(
  env: Env,
  input: {
    architecture: string;
    loraBindings: ImageWorkflowLoraBindingInput[];
    modelIds: string[];
    workflowKey: string;
  },
): Promise<void> {
  const modelIds = [...new Set(input.modelIds.map((id) => id.trim()).filter(Boolean))];
  const loraIds = [...new Set(input.loraBindings.flatMap((binding) => binding.lora_ids).map((id) => id.trim()).filter(Boolean))];
  const models = await loadAssetsByIds<AssetBindingModel>(
    env,
    "image_models",
    "id, architecture, style_family",
    modelIds,
  );
  for (const modelId of modelIds) {
    const model = models.get(modelId);
    if (!model) {
      throw new Error(`workflow ${input.workflowKey} references missing checkpoint ${modelId}.`);
    }
    if (model.architecture !== input.architecture) {
      throw new Error(
        `workflow ${input.workflowKey} architecture ${input.architecture} cannot bind checkpoint ${modelId} architecture ${model.architecture}.`,
      );
    }
  }

  if (loraIds.length === 0) return;
  const loras = await loadAssetsByIds<AssetBindingLora>(
    env,
    "image_loras",
    "id, architecture, style_family",
    loraIds,
  );
  for (const binding of input.loraBindings) {
    const model = models.get(binding.model_id);
    if (!model) continue;
    for (const loraId of binding.lora_ids) {
      const lora = loras.get(loraId);
      if (!lora) {
        throw new Error(`workflow ${input.workflowKey} references missing LoRA ${loraId}.`);
      }
      if (lora.architecture !== model.architecture) {
        throw new Error(
          `checkpoint ${binding.model_id} architecture ${model.architecture} cannot bind LoRA ${loraId} architecture ${lora.architecture}.`,
        );
      }
      if (lora.style_family !== model.style_family) {
        throw new Error(
          `checkpoint ${binding.model_id} lane ${model.style_family} cannot bind LoRA ${loraId} lane ${lora.style_family}.`,
        );
      }
    }
  }
}

async function loadAssetsByIds<T extends { id: string }>(
  env: Env,
  table: "image_models" | "image_loras",
  columns: string,
  ids: string[],
): Promise<Map<string, T>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT ${columns} FROM ${table} WHERE id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<T>();
  return new Map((results ?? []).map((row) => [row.id, row]));
}

function normalizeLoraBindings(
  bindings: ImageWorkflowLoraBindingInput[],
  modelIds: string[],
): ImageWorkflowLoraBindingInput[] {
  const allowedModels = new Set(modelIds);
  const byModel = new Map<string, string[]>();
  for (const binding of bindings) {
    const modelId = binding.model_id.trim();
    if (!allowedModels.has(modelId)) continue;
    const existing = byModel.get(modelId) ?? [];
    for (const loraId of binding.lora_ids) {
      const id = loraId.trim();
      if (id && !existing.includes(id)) existing.push(id);
    }
    if (existing.length > 0) byModel.set(modelId, existing);
  }
  return [...byModel.entries()].map(([model_id, lora_ids]) => ({ lora_ids, model_id }));
}

export function normalizeArchitecture(
  value: string | null | undefined,
  fieldName: string,
  options?: { required?: boolean },
): string {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) {
    if (options?.required) {
      throw new Error(`${fieldName} must be one of ${BASE_ARCHITECTURES.join(", ")}.`);
    }
    return "";
  }
  if (!BASE_ARCHITECTURE_SET.has(trimmed)) {
    throw new Error(`${fieldName} must be one of ${BASE_ARCHITECTURES.join(", ")}.`);
  }
  return trimmed;
}

function normalizeLane(value: string | null | undefined, fieldName: string): string {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) return "";
  if (!ASSET_LANES.has(trimmed)) {
    throw new Error(`${fieldName} must be "anime" or "realistic".`);
  }
  return trimmed;
}

function normalizeLaneList(
  value: string | null | undefined,
  fieldName: string,
  options?: { required?: boolean },
): string {
  const tokens = (value ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(tokens)];
  if (options?.required && unique.length === 0) {
    throw new Error(`${fieldName} must include "anime" or "realistic".`);
  }
  for (const token of unique) {
    if (!ASSET_LANES.has(token)) {
      throw new Error(`${fieldName} only supports "anime" and "realistic".`);
    }
  }
  return unique.join(",");
}
