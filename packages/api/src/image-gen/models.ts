import type { ArtStyle } from "./types";
import { isArtStyle } from "./types";

/**
 * WF1 selectable model catalog (spec: image-gen WF1 model selection).
 *
 * Flat list of RunningHub checkpoints, each carrying its own style tag. The
 * style tag selects the repo-managed workflow config synced into app_settings;
 * ckpt_name overrides that workflow's checkpoint so creators can pick a model
 * at companion-create time. Admin-editable (stored in DB).
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

/**
 * Lenient check: does the WF1 create workflow for `style` declare a checkpoint
 * node? When it does not, a model's `ckpt_name` is silently ignored at
 * generation time — `runninghub-provider` only injects the ckpt override when
 * `checkpointNodeId` is set, so the model falls back to the workflow's built-in
 * checkpoint. The admin workspace uses this to warn on such models. Never throws
 * on malformed JSON (returns false).
 */
export function styleHasCheckpointNode(
  createWorkflowsRaw: string | null | undefined,
  style: string,
): boolean {
  if (!createWorkflowsRaw) return false;
  try {
    const parsed = JSON.parse(createWorkflowsRaw) as Record<
      string,
      { checkpointNodeId?: unknown } | undefined
    >;
    const node = parsed[style]?.checkpointNodeId;
    return node != null && String(node).trim().length > 0;
  } catch {
    return false;
  }
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
