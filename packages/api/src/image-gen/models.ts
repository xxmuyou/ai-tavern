/**
 * WF1 selectable model catalog (spec-022, "workflow -> models").
 *
 * Flat list of RunningHub checkpoints. Each model belongs to a workflow
 * (`workflow_key`) and carries a free-form `tag` (replaces the old hardcoded
 * art-style enum), the checkpoint file (`ckpt_name`), and the field name on the
 * workflow's checkpoint node (`checkpoint_field_name`). The model is the single
 * source of truth for which checkpoint runs — the workflow config no longer
 * carries a default ckpt. Admin-editable (stored in DB).
 */
export type ImageModelRow = {
  id: string;
  label: string;
  tag: string;
  ckpt_name: string;
  checkpoint_field_name: string | null;
  workflow_key: string;
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
  checkpoint_field_name: string | null;
  workflow_key: string;
};

export type ImageModelInput = {
  label: string;
  tag: string;
  ckpt_name: string;
  checkpoint_field_name: string | null;
  workflow_key: string;
  is_active: boolean;
  sort_order: number;
};

const COLUMNS =
  "id, label, tag, ckpt_name, checkpoint_field_name, workflow_key, is_active, sort_order, updated_at, updated_by";

function toImageModel(row: ImageModelRow): ImageModel {
  return {
    id: row.id,
    label: row.label,
    tag: row.tag,
    ckpt_name: row.ckpt_name,
    checkpoint_field_name: row.checkpoint_field_name,
    workflow_key: row.workflow_key,
  };
}

/** Active models, ordered for display. */
export async function listActiveImageModels(env: Env): Promise<ImageModel[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM image_models WHERE is_active = 1 ORDER BY sort_order ASC, label ASC`,
  ).all<ImageModelRow>();
  return (results ?? []).map(toImageModel);
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

export async function createImageModel(
  env: Env,
  id: string,
  input: ImageModelInput,
  updatedBy: string,
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO image_models (id, label, tag, ckpt_name, checkpoint_field_name, workflow_key, is_active, sort_order, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.label,
      input.tag,
      input.ckpt_name,
      input.checkpoint_field_name,
      input.workflow_key,
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
     SET label = ?, tag = ?, ckpt_name = ?, checkpoint_field_name = ?, workflow_key = ?, is_active = ?, sort_order = ?, updated_at = ?, updated_by = ?
     WHERE id = ?`,
  )
    .bind(
      input.label,
      input.tag,
      input.ckpt_name,
      input.checkpoint_field_name,
      input.workflow_key,
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
