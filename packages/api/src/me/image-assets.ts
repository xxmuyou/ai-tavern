import { requireAuthUser } from "../auth";
import { jsonResponse } from "../http";
import { clearProfileImagesForDeletedAsset } from "../image-gen/profile-outfit";

const MAX_PROMPT_LENGTH = 4000;
const MAX_MODEL_ID_LENGTH = 128;
const VALID_SOURCES = new Set(["generated", "upload"]);

type ImageAssetRow = {
  id: string;
  art_key: string;
  source: string;
  prompt: string | null;
  model_id: string | null;
  created_at: number;
};

export async function handleMeImageAssetsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/me/image-assets") {
    const user = await requireAuthUser(env, request);
    if (request.method === "GET") {
      return listAssets(env, user.id);
    }
    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      return saveAsset(env, user.id, body);
    }
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const deleteMatch = pathname.match(/^\/me\/image-assets\/([^/]+)$/);
  if (deleteMatch) {
    if (request.method !== "DELETE") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    const id = decodeURIComponent(deleteMatch[1] ?? "");
    if (!id) {
      return jsonResponse({ error: "invalid_asset_id" }, { status: 400 });
    }
    const row = await env.DB.prepare(
      `SELECT art_key FROM user_image_assets WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    )
      .bind(id, user.id)
      .first<{ art_key: string }>();
    await env.DB.prepare(
      `UPDATE user_image_assets
       SET deleted_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    )
      .bind(Date.now(), id, user.id)
      .run();
    if (row?.art_key) {
      await clearProfileImagesForDeletedAsset(env, user.id, row.art_key);
    }
    return jsonResponse({ ok: true });
  }

  return null;
}

async function listAssets(env: Env, userId: string): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, art_key, source, prompt, model_id, created_at
     FROM user_image_assets
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 100`,
  )
    .bind(userId)
    .all<ImageAssetRow>();

  return jsonResponse({
    assets: (results ?? []).map((row) => ({
      id: row.id,
      art_key: row.art_key,
      source: row.source,
      prompt: row.prompt,
      model_id: row.model_id,
      created_at: row.created_at,
    })),
  });
}

async function saveAsset(env: Env, userId: string, body: unknown): Promise<Response> {
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const artKey = normalizeObjectKey(raw.art_key);
  if (!artKey) {
    return jsonResponse({ error: "invalid_art_key" }, { status: 400 });
  }
  if (!isUserOwnedArtKey(artKey, userId)) {
    return jsonResponse({ error: "forbidden" }, { status: 403 });
  }
  const source = typeof raw.source === "string" ? raw.source.trim() : "";
  if (!VALID_SOURCES.has(source)) {
    return jsonResponse({ error: "invalid_source" }, { status: 400 });
  }

  const assetExists = await env.DB.prepare("SELECT key FROM asset_objects WHERE key = ?")
    .bind(artKey)
    .first<{ key: string }>();
  if (!assetExists) {
    return jsonResponse({ error: "asset_not_found" }, { status: 404 });
  }

  const prompt = readOptionalText(raw.prompt, MAX_PROMPT_LENGTH);
  const modelId = readOptionalText(raw.model_id, MAX_MODEL_ID_LENGTH);
  const id = crypto.randomUUID();
  const now = Date.now();
  const result = await env.DB.prepare(
    `INSERT INTO user_image_assets
       (id, user_id, art_key, source, prompt, model_id, created_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(user_id, art_key) DO UPDATE SET
       source = excluded.source,
       prompt = COALESCE(excluded.prompt, user_image_assets.prompt),
       model_id = COALESCE(excluded.model_id, user_image_assets.model_id),
       deleted_at = NULL`,
  )
    .bind(id, userId, artKey, source, prompt, modelId, now)
    .run();

  const row = await env.DB.prepare(
    `SELECT id, art_key, source, prompt, model_id, created_at
     FROM user_image_assets
     WHERE user_id = ? AND art_key = ?`,
  )
    .bind(userId, artKey)
    .first<ImageAssetRow>();

  return jsonResponse(
    {
      id: row?.id ?? id,
      art_key: row?.art_key ?? artKey,
      source: row?.source ?? source,
      prompt: row?.prompt ?? prompt,
      model_id: row?.model_id ?? modelId,
      created_at: row?.created_at ?? now,
    },
    { status: result.meta.changes ? 201 : 200 },
  );
}

function normalizeObjectKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().replace(/^\/+/, "");
  if (!key || key.includes("..") || key.length > 512) return null;
  return key;
}

function isUserOwnedArtKey(key: string, userId: string): boolean {
  return key.startsWith(`user-art/${userId}/`) || key.startsWith(`companions/user/${userId}/`);
}

function readOptionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}
