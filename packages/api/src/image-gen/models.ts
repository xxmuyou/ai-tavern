import type { ArtStyle } from "./types";
import { isArtStyle } from "./types";

/**
 * WF1 selectable model catalog (spec: image-gen WF1 model selection).
 *
 * Flat list of RunningHub checkpoints, each carrying its own style tag. The
 * style tag selects which env workflow config (RUNNINGHUB_CREATE_WORKFLOWS) to
 * use; ckpt_name overrides that workflow's checkpoint so creators can pick a
 * model at companion-create time. Admin-editable (stored in DB).
 */
export type ImageModelRow = {
  id: string;
  label: string;
  style_tag: string;
  ckpt_name: string;
  is_active: number;
  sort_order: number;
  updated_at: number;
  updated_by: string | null;
};

export type ImageModel = {
  id: string;
  label: string;
  style_tag: ArtStyle;
  ckpt_name: string;
};

export type ImageModelInput = {
  label: string;
  style_tag: ArtStyle;
  ckpt_name: string;
  is_active: boolean;
  sort_order: number;
};

function toImageModel(row: ImageModelRow): ImageModel | null {
  if (!isArtStyle(row.style_tag)) return null;
  return {
    id: row.id,
    label: row.label,
    style_tag: row.style_tag,
    ckpt_name: row.ckpt_name,
  };
}

/** Active models, ordered for display, with a valid style tag. */
export async function listActiveImageModels(env: Env): Promise<ImageModel[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, label, style_tag, ckpt_name, is_active, sort_order, updated_at, updated_by
     FROM image_models WHERE is_active = 1 ORDER BY sort_order ASC, label ASC`,
  ).all<ImageModelRow>();
  return (results ?? [])
    .map(toImageModel)
    .filter((m): m is ImageModel => m !== null);
}

/** Every model (active or not) for the admin workspace. */
export async function listImageModelRows(env: Env): Promise<ImageModelRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, label, style_tag, ckpt_name, is_active, sort_order, updated_at, updated_by
     FROM image_models ORDER BY sort_order ASC, label ASC`,
  ).all<ImageModelRow>();
  return results ?? [];
}

export async function getImageModel(env: Env, id: string): Promise<ImageModel | null> {
  const row = await env.DB.prepare(
    `SELECT id, label, style_tag, ckpt_name, is_active, sort_order, updated_at, updated_by
     FROM image_models WHERE id = ?`,
  )
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
    `INSERT INTO image_models (id, label, style_tag, ckpt_name, is_active, sort_order, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.label,
      input.style_tag,
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
     SET label = ?, style_tag = ?, ckpt_name = ?, is_active = ?, sort_order = ?, updated_at = ?, updated_by = ?
     WHERE id = ?`,
  )
    .bind(
      input.label,
      input.style_tag,
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
