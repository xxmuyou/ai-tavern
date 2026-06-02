import type { ImageGenMode } from "./types";

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
};

export type ImageModelInput = {
  label: string;
  tag: string;
  ckpt_name: string;
  is_active: boolean;
  sort_order: number;
};

export type ImageWorkflowRow = {
  key: string;
  label: string;
  mode: ImageGenMode;
  workflow_id: string;
  prompt_node_id: string;
  prompt_field_name: string;
  checkpoint_node_id: string | null;
  checkpoint_field_name: string;
  load_image_node_id: string | null;
  is_active: number;
  sort_order: number;
  updated_at: number;
  updated_by: string | null;
};

export type ImageWorkflow = {
  key: string;
  label: string;
  mode: ImageGenMode;
  workflow_id: string;
  prompt_node_id: string;
  prompt_field_name: string;
  checkpoint_node_id: string | null;
  checkpoint_field_name: string;
  load_image_node_id: string | null;
  is_active: boolean;
  sort_order: number;
};

export type ImageWorkflowInput = {
  key: string;
  label: string;
  mode: ImageGenMode;
  workflow_id: string;
  prompt_node_id: string;
  prompt_field_name: string | null;
  checkpoint_node_id: string | null;
  checkpoint_field_name: string | null;
  load_image_node_id: string | null;
  model_ids: string[];
  is_active: boolean;
  sort_order: number;
};

export type ImageWorkflowWithModels = ImageWorkflow & {
  model_ids: string[];
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
};

export type ImageModelSelection = {
  option_id: string;
  workflow: ImageWorkflow;
  model: ImageModel;
};

const COLUMNS =
  "id, label, tag, ckpt_name, is_active, sort_order, updated_at, updated_by";
const WORKFLOW_COLUMNS =
  "key, label, mode, workflow_id, prompt_node_id, prompt_field_name, checkpoint_node_id, checkpoint_field_name, load_image_node_id, is_active, sort_order, updated_at, updated_by";

function toImageModel(row: ImageModelRow): ImageModel {
  return {
    id: row.id,
    label: row.label,
    tag: row.tag,
    ckpt_name: row.ckpt_name,
  };
}

function toImageWorkflow(row: ImageWorkflowRow): ImageWorkflow {
  return {
    checkpoint_field_name: row.checkpoint_field_name || "ckpt_name",
    checkpoint_node_id: row.checkpoint_node_id,
    is_active: row.is_active === 1,
    key: row.key,
    label: row.label,
    load_image_node_id: row.load_image_node_id,
    mode: row.mode,
    prompt_field_name: row.prompt_field_name || "text",
    prompt_node_id: row.prompt_node_id,
    sort_order: row.sort_order,
    workflow_id: row.workflow_id,
  };
}

export function imageModelOptionId(workflowKey: string, modelId: string): string {
  return `${workflowKey}::${modelId}`;
}

function splitOptionId(id: string): { workflowKey: string; modelId: string } | null {
  const idx = id.indexOf("::");
  if (idx <= 0 || idx === id.length - 2) return null;
  return { workflowKey: id.slice(0, idx), modelId: id.slice(idx + 2) };
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
       AND w.mode = 'create'
     ORDER BY w.sort_order ASC, wm.sort_order ASC, m.sort_order ASC, m.label ASC`,
  ).all<{
    workflow_key: string;
    workflow_label: string;
    checkpoint_node_id: string | null;
    model_id: string;
    label: string;
    tag: string;
    ckpt_name: string;
  }>();

  return (results ?? []).map((row) => ({
    checkpoint_applies: Boolean(row.checkpoint_node_id?.trim()),
    ckpt_name: row.ckpt_name,
    id: imageModelOptionId(row.workflow_key, row.model_id),
    label: row.workflow_label ? `${row.label} · ${row.workflow_label}` : row.label,
    model_id: row.model_id,
    tag: row.tag,
    workflow_key: row.workflow_key,
    workflow_label: row.workflow_label,
  }));
}

/** Every model (active or not) for the admin workspace. */
export async function listImageModelRows(env: Env): Promise<ImageModelRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM image_models ORDER BY sort_order ASC, label ASC`,
  ).all<ImageModelRow>();
  return results ?? [];
}

export async function getImageModel(env: Env, id: string): Promise<ImageModel | null> {
  const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM image_models WHERE id = ?`)
    .bind(id)
    .first<ImageModelRow>();
  return row ? toImageModel(row) : null;
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
     WHERE wm.model_id = ?
       AND wm.is_active = 1
       AND w.is_active = 1
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
       m.ckpt_name AS model_ckpt_name
     FROM image_workflow_models wm
     JOIN image_workflows w ON w.key = wm.workflow_key
     JOIN image_models m ON m.id = wm.model_id
     WHERE wm.workflow_key = ?
       AND wm.model_id = ?
       AND wm.is_active = 1
       AND w.is_active = 1
       AND m.is_active = 1
       AND w.mode = 'create'
     LIMIT 1`,
  )
    .bind(workflowKey, modelId)
    .first<ImageWorkflowRow & {
      model_id: string;
      model_label: string;
      model_tag: string;
      model_ckpt_name: string;
    }>();
  if (!row) return null;

  return {
    model: {
      ckpt_name: row.model_ckpt_name,
      id: row.model_id,
      label: row.model_label,
      tag: row.model_tag,
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
  await env.DB.prepare(
    `INSERT INTO image_models (id, label, tag, ckpt_name, is_active, sort_order, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.label,
      input.tag,
      input.ckpt_name,
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
  await env.DB.prepare(
    `UPDATE image_models
     SET label = ?, tag = ?, ckpt_name = ?, is_active = ?, sort_order = ?, updated_at = ?, updated_by = ?
     WHERE id = ?`,
  )
    .bind(
      input.label,
      input.tag,
      input.ckpt_name,
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

  return workflows.map((row) => ({
    ...toImageWorkflow(row),
    model_ids: modelIdsByWorkflow.get(row.key) ?? [],
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  }));
}

export async function getImageWorkflow(env: Env, key: string): Promise<ImageWorkflow | null> {
  const row = await env.DB.prepare(`SELECT ${WORKFLOW_COLUMNS} FROM image_workflows WHERE key = ?`)
    .bind(key)
    .first<ImageWorkflowRow>();
  return row ? toImageWorkflow(row) : null;
}

export async function upsertImageWorkflow(
  env: Env,
  input: ImageWorkflowInput,
  updatedBy: string | null,
): Promise<void> {
  const now = Date.now();
  const checkpointFieldName = input.checkpoint_field_name?.trim() || "ckpt_name";
  const promptFieldName = input.prompt_field_name?.trim() || "text";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO image_workflows
         (key, label, mode, workflow_id, prompt_node_id, prompt_field_name, checkpoint_node_id,
          checkpoint_field_name, load_image_node_id, is_active, sort_order, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         label = excluded.label,
         mode = excluded.mode,
         workflow_id = excluded.workflow_id,
         prompt_node_id = excluded.prompt_node_id,
         prompt_field_name = excluded.prompt_field_name,
         checkpoint_node_id = excluded.checkpoint_node_id,
         checkpoint_field_name = excluded.checkpoint_field_name,
         load_image_node_id = excluded.load_image_node_id,
         is_active = excluded.is_active,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    ).bind(
      input.key,
      input.label,
      input.mode,
      input.workflow_id,
      input.prompt_node_id,
      promptFieldName,
      input.checkpoint_node_id,
      checkpointFieldName,
      input.load_image_node_id,
      input.is_active ? 1 : 0,
      input.sort_order,
      now,
      updatedBy,
    ),
    env.DB.prepare(`DELETE FROM image_workflow_models WHERE workflow_key = ?`).bind(input.key),
    ...input.model_ids.map((modelId, index) =>
      env.DB.prepare(
        `INSERT INTO image_workflow_models
           (workflow_key, model_id, is_active, sort_order, updated_at, updated_by)
         VALUES (?, ?, 1, ?, ?, ?)`,
      ).bind(input.key, modelId, index + 1, now, updatedBy),
    ),
  ]);
}

export async function deleteImageWorkflow(env: Env, key: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM image_workflows WHERE key = ?`).bind(key).run();
}
