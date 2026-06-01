import { requireAdminUser } from "../../auth";
import { jsonResponse } from "../../http";
import { loadUpdatedByEmails } from "../../llm/admin/repo";
import { resolveImageGenConfig } from "../../settings/store";
import {
  createImageModel,
  deleteImageModel,
  isExpressionGender,
  listExpressionPrompts,
  listImageModelRows,
  styleHasCheckpointNode,
  updateImageModel,
  upsertExpressionPrompt,
  type ImageModelInput,
} from "../index";
import { isNonNeutralEmotion } from "../expression-prompts";
import { isArtStyle } from "../types";

/**
 * Admin workspace endpoints for the WF1 model catalog and WF2 expression
 * prompts. Mirrors the llm_config admin pattern.
 */
export async function handleAdminImageGenRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname.startsWith("/admin/image-models")) {
    return handleImageModels(request, env, pathname);
  }
  if (pathname.startsWith("/admin/expression-prompts")) {
    return handleExpressionPrompts(request, env, pathname);
  }
  if (pathname === "/admin/image-gen-jobs") {
    return handleImageGenJobs(request, env);
  }
  return null;
}

type ImageGenJobSummaryRow = {
  id: string;
  status: string;
  task: string;
  style: string | null;
  model: string | null;
  provider: string | null;
  error_code: string | null;
  error_message: string | null;
  provider_task_id: string | null;
  created_at: number;
  completed_at: number | null;
};

const JOB_STATUSES = new Set(["pending", "processing", "succeeded", "failed", "cancelled"]);

/**
 * Read-only diagnostics: list recent image generation jobs so admins can see the
 * real provider failure reason (error_message holds the raw RunningHub message)
 * without querying D1 by hand. Defaults to the most recent failures.
 */
async function handleImageGenJobs(request: Request, env: Env): Promise<Response> {
  await requireAdminUser(env, request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const rawLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50;

  const where = status && JOB_STATUSES.has(status) ? "WHERE status = ?" : "";
  const sql = `SELECT id, status, task, style, model, provider, error_code, error_message,
                      provider_task_id, created_at, completed_at
               FROM image_generation_jobs
               ${where}
               ORDER BY created_at DESC
               LIMIT ?`;
  const stmt = where
    ? env.DB.prepare(sql).bind(status, limit)
    : env.DB.prepare(sql).bind(limit);
  const { results } = await stmt.all<ImageGenJobSummaryRow>();
  return jsonResponse({ jobs: results ?? [] });
}

async function handleImageModels(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/admin/image-models" && request.method === "GET") {
    await requireAdminUser(env, request);
    const rows = await listImageModelRows(env);
    const emails = await loadUpdatedByEmails(
      env,
      rows.map((r) => r.updated_by).filter((id): id is string => id !== null),
    );
    // Flag models whose ckpt_name would be silently ignored: the create
    // workflow for that style has no checkpoint node configured, so generation
    // falls back to the workflow's built-in checkpoint.
    const { createWorkflows } = await resolveImageGenConfig(env);
    const models = rows.map((r) => ({
      ...r,
      is_active: r.is_active === 1,
      updated_by_email: r.updated_by ? emails.get(r.updated_by) ?? null : null,
      checkpoint_applies: styleHasCheckpointNode(createWorkflows, r.style_tag),
    }));
    return jsonResponse({ models });
  }

  if (pathname === "/admin/image-models" && request.method === "POST") {
    const admin = await requireAdminUser(env, request);
    const body = await request.json().catch(() => null);
    const parsed = parseModelInput(body);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, { status: 400 });
    }
    const id = slugifyModelId(parsed.value.label);
    await createImageModel(env, id, parsed.value, admin.id);
    return jsonResponse({ id, ok: true }, { status: 201 });
  }

  const idMatch = pathname.match(/^\/admin\/image-models\/([^/]+)$/);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1] ?? "");
    if (request.method === "PUT") {
      const admin = await requireAdminUser(env, request);
      const body = await request.json().catch(() => null);
      const parsed = parseModelInput(body);
      if (!parsed.ok) {
        return jsonResponse({ error: parsed.error }, { status: 400 });
      }
      await updateImageModel(env, id, parsed.value, admin.id);
      return jsonResponse({ ok: true });
    }
    if (request.method === "DELETE") {
      await requireAdminUser(env, request);
      await deleteImageModel(env, id);
      return jsonResponse({ ok: true });
    }
  }

  return null;
}

async function handleExpressionPrompts(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/admin/expression-prompts" && request.method === "GET") {
    await requireAdminUser(env, request);
    const rows = await listExpressionPrompts(env);
    const emails = await loadUpdatedByEmails(
      env,
      rows.map((r) => r.updated_by).filter((id): id is string => id !== null),
    );
    const prompts = rows.map((r) => ({
      ...r,
      updated_by_email: r.updated_by ? emails.get(r.updated_by) ?? null : null,
    }));
    return jsonResponse({ prompts });
  }

  const match = pathname.match(/^\/admin\/expression-prompts\/([^/]+)\/([^/]+)$/);
  if (match && request.method === "PUT") {
    const admin = await requireAdminUser(env, request);
    const gender = decodeURIComponent(match[1] ?? "");
    const emotion = decodeURIComponent(match[2] ?? "");
    if (!isExpressionGender(gender) || !isNonNeutralEmotion(emotion)) {
      return jsonResponse({ error: "invalid_key" }, { status: 400 });
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return jsonResponse({ error: "prompt_required" }, { status: 400 });
    }
    await upsertExpressionPrompt(env, gender, emotion, prompt, admin.id);
    return jsonResponse({ ok: true });
  }

  return null;
}

type ParseResult =
  | { ok: true; value: ImageModelInput }
  | { ok: false; error: string };

function parseModelInput(body: unknown): ParseResult {
  const raw = (body ?? {}) as Record<string, unknown>;
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const ckptName = typeof raw.ckpt_name === "string" ? raw.ckpt_name.trim() : "";
  if (!label || !ckptName || !isArtStyle(raw.style_tag)) {
    return { ok: false, error: "invalid_model" };
  }
  return {
    ok: true,
    value: {
      label,
      style_tag: raw.style_tag,
      ckpt_name: ckptName,
      is_active: raw.is_active === undefined ? true : Boolean(raw.is_active),
      sort_order: Number.isFinite(raw.sort_order) ? Number(raw.sort_order) : 0,
    },
  };
}

function slugifyModelId(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomUUID().slice(0, 8);
  return base ? `${base}_${suffix}` : suffix;
}
