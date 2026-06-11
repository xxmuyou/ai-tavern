import { requireAuthUser } from "../auth";
import { jsonResponse, notFound } from "../http";
import { ImageGenError } from "../image-gen";
import {
  createOrReuseCutoutJob,
  loadCompanionCutoutSource,
  loadCutoutByCompanionAndSource,
  type CompanionCutoutJobRow,
} from "../image-gen/cutout";

type CompanionVisibilityRow = {
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
  is_public: number;
};

export type CompanionCutoutStatusResponse = {
  companion_id: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "cancelled";
  art_cutout_url: string | null;
  job_id: string | null;
  error_code: string | null;
  error_message: string | null;
};

export async function loadCompanionCutoutStatus(
  env: Env,
  userId: string,
  companionId: string,
): Promise<CompanionCutoutStatusResponse | null> {
  const source = await loadCompanionCutoutSource(env, companionId, userId);
  if (!source) return null;
  if (source.art_cutout_key) {
    return {
      art_cutout_url: source.art_cutout_key,
      companion_id: companionId,
      error_code: null,
      error_message: null,
      job_id: null,
      status: "succeeded",
    };
  }
  if (!source.art_url) {
    return {
      art_cutout_url: null,
      companion_id: companionId,
      error_code: "source_art_missing",
      error_message: "Companion has no source art for cutout.",
      job_id: null,
      status: "failed",
    };
  }
  const job = await loadCutoutByCompanionAndSource(env, companionId, source.art_url);
  return statusFromJob(companionId, job);
}

export async function handleCompanionCutoutRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const match = pathname.match(/^\/companions\/([^/]+)\/cutout(?:\/ensure)?$/);
  if (!match) return null;

  const companionId = decodeURIComponent(match[1] ?? "");
  if (!companionId) {
    return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
  }

  const isEnsure = pathname.endsWith("/ensure");
  if ((!isEnsure && request.method !== "GET") || (isEnsure && request.method !== "POST")) {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const user = await requireAuthUser(env, request);
  const visibility = await loadVisibility(env, companionId);
  if (!visibility || !canRead(visibility, user.id)) {
    return notFound();
  }

  if (!isEnsure) {
    const status = await loadCompanionCutoutStatus(env, user.id, companionId);
    return status ? jsonResponse(status) : notFound();
  }

  const source = await loadCompanionCutoutSource(env, companionId, user.id);
  if (!source) return notFound();
  if (!source.art_url) {
    return jsonResponse(
      { error: "source_art_missing", message: "Companion has no source art for cutout." },
      { status: 422 },
    );
  }

  try {
    const job = await createOrReuseCutoutJob(env, {
      companionId,
      sourceArtUrl: source.art_url,
      userId: user.id,
    });
    return jsonResponse(statusFromJob(companionId, job));
  } catch (err) {
    if (err instanceof ImageGenError) {
      return jsonResponse(
        { error: err.code, message: err.message },
        { status: err.code === "source_art_not_available" ? 422 : 400 },
      );
    }
    throw err;
  }
}

async function loadVisibility(env: Env, companionId: string): Promise<CompanionVisibilityRow | null> {
  return env.DB.prepare(
    `SELECT source, created_by, is_active, is_public
     FROM companions
     WHERE id = ?`,
  )
    .bind(companionId)
    .first<CompanionVisibilityRow>();
}

function canRead(row: CompanionVisibilityRow, userId: string): boolean {
  if (row.is_active === 0) return false;
  if (row.source === "official") return true;
  if (row.is_public === 1) return true;
  return row.created_by === userId;
}

function statusFromJob(
  companionId: string,
  job: CompanionCutoutJobRow | null,
): CompanionCutoutStatusResponse {
  if (!job) {
    return {
      art_cutout_url: null,
      companion_id: companionId,
      error_code: null,
      error_message: null,
      job_id: null,
      status: "pending",
    };
  }
  return {
    art_cutout_url: job.status === "succeeded" ? job.output_key : null,
    companion_id: companionId,
    error_code: job.error_code,
    error_message: job.error_message,
    job_id: job.image_job_id,
    status: job.status,
  };
}
