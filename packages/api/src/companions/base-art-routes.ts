import { requireAuthUser } from "../auth";
import { jsonResponse } from "../http";
import type { UserRecord } from "../identity";
import { getImageModel, isArtStyle, listActiveImageModels, type ArtStyle } from "../image-gen";
import {
  type BaseArtSource,
  createBaseArtJob,
  loadBaseArtJob,
} from "../image-gen/base-art";

/**
 * spec-022 WF-1 create — companion base-art draft, generated BEFORE the
 * companion exists (so not under /companions/{id}/):
 *   POST /companions/base-art/generate
 *   GET  /companions/base-art/jobs/{jobId}
 */
export async function handleBaseArtRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/image-models") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    await requireAuthUser(env, request);
    const models = await listActiveImageModels(env);
    return jsonResponse({
      models: models.map((m) => ({ id: m.id, label: m.label, style_tag: m.style_tag })),
    });
  }

  if (pathname === "/companions/base-art/generate") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    const body = await request.json().catch(() => null);
    return handleGenerate(env, user, body);
  }

  const jobMatch = pathname.match(/^\/companions\/base-art\/jobs\/([^/]+)$/);
  if (jobMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const jobId = decodeURIComponent(jobMatch[1] ?? "");
    if (!jobId) {
      return jsonResponse({ error: "invalid_job_id" }, { status: 400 });
    }
    const user = await requireAuthUser(env, request);
    return handleJobStatus(env, user, jobId);
  }

  return null;
}

async function handleGenerate(
  env: Env,
  user: UserRecord,
  body: unknown,
): Promise<Response> {
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "invalid_source" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const source = raw.source;
  if (source !== "text" && source !== "upload") {
    return jsonResponse({ error: "invalid_source" }, { status: 400 });
  }

  // Prefer an explicit model selection; fall back to a bare style for
  // backward compatibility.
  let style: ArtStyle | undefined;
  let ckptName: string | undefined;
  if (typeof raw.model === "string" && raw.model.trim()) {
    const model = await getImageModel(env, raw.model.trim());
    if (!model) {
      return jsonResponse({ error: "invalid_model" }, { status: 400 });
    }
    style = model.style_tag;
    ckptName = model.ckpt_name;
  } else if (isArtStyle(raw.style)) {
    style = raw.style;
  } else {
    return jsonResponse({ error: "invalid_model" }, { status: 400 });
  }

  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  const uploadKey = typeof raw.upload_key === "string" ? raw.upload_key.trim() : "";

  if (source === "text" && !prompt) {
    return jsonResponse({ error: "prompt_required" }, { status: 400 });
  }
  if (source === "upload" && !uploadKey) {
    return jsonResponse({ error: "upload_key_required" }, { status: 400 });
  }

  const jobId = await createBaseArtJob(env, {
    prompt: prompt || undefined,
    source: source as BaseArtSource,
    style,
    ckptName,
    uploadKey: uploadKey || undefined,
    userId: user.id,
  });

  return jsonResponse({ job_id: jobId, status: "queued" }, { status: 202 });
}

async function handleJobStatus(
  env: Env,
  user: UserRecord,
  jobId: string,
): Promise<Response> {
  const job = await loadBaseArtJob(env, jobId);
  if (!job || job.user_id !== user.id) {
    return jsonResponse({ error: "not_found" }, { status: 404 });
  }

  return jsonResponse({
    art_key: job.output_key ?? undefined,
    error_code: job.error_code ?? undefined,
    status: job.status,
  });
}
