import { requireAdminUser } from "../../auth";
import { jsonResponse } from "../../http";
import { loadUpdatedByEmails } from "../../llm/admin/repo";
import {
  createImageModel,
  deleteImageWorkflow,
  deleteImageModel,
  isExpressionGender,
  listExpressionPrompts,
  listImageModelRows,
  listImageWorkflowRows,
  updateImageModel,
  upsertImageWorkflow,
  upsertExpressionPrompt,
  type ImageModelInput,
  type ImageWorkflowInput,
} from "../index";
import { isNonNeutralEmotion } from "../expression-prompts";

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
  if (pathname.startsWith("/admin/image-workflows")) {
    return handleImageWorkflows(request, env, pathname);
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
  workflow_key: string | null;
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
  const sql = `SELECT id, status, task, workflow_key, model, provider, error_code, error_message,
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
    const models = rows.map((r) => ({
      ...r,
      is_active: r.is_active === 1,
      updated_by_email: r.updated_by ? emails.get(r.updated_by) ?? null : null,
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

async function handleImageWorkflows(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/admin/image-workflows" && request.method === "GET") {
    await requireAdminUser(env, request);
    const rows = await listImageWorkflowRows(env);
    const emails = await loadUpdatedByEmails(
      env,
      rows.map((r) => r.updated_by).filter((id): id is string => id !== null),
    );
    const workflows = rows.map((r) => ({
      ...r,
      updated_by_email: r.updated_by ? emails.get(r.updated_by) ?? null : null,
    }));
    return jsonResponse({ workflows });
  }

  if (pathname === "/admin/image-workflows" && request.method === "POST") {
    const admin = await requireAdminUser(env, request);
    const body = await request.json().catch(() => null);
    const parsed = parseWorkflowInput(body);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, { status: 400 });
    }
    await upsertImageWorkflow(env, parsed.value, admin.id);
    return jsonResponse({ key: parsed.value.key, ok: true }, { status: 201 });
  }

  const keyMatch = pathname.match(/^\/admin\/image-workflows\/([^/]+)$/);
  if (keyMatch) {
    const key = decodeURIComponent(keyMatch[1] ?? "");
    if (request.method === "PUT") {
      const admin = await requireAdminUser(env, request);
      const body = await request.json().catch(() => null);
      const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const parsed = parseWorkflowInput({ ...raw, key });
      if (!parsed.ok) {
        return jsonResponse({ error: parsed.error }, { status: 400 });
      }
      await upsertImageWorkflow(env, parsed.value, admin.id);
      return jsonResponse({ ok: true });
    }
    if (request.method === "DELETE") {
      await requireAdminUser(env, request);
      await deleteImageWorkflow(env, key);
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
  if (!label || !ckptName) {
    return { ok: false, error: "invalid_model" };
  }
  const tag = typeof raw.tag === "string" ? raw.tag.trim() : "";
  return {
    ok: true,
    value: {
      label,
      tag,
      ckpt_name: ckptName,
      is_active: raw.is_active === undefined ? true : Boolean(raw.is_active),
      sort_order: readNumber(raw.sort_order),
    },
  };
}

type WorkflowParseResult =
  | { ok: true; value: ImageWorkflowInput }
  | { ok: false; error: string };

function parseWorkflowInput(body: unknown): WorkflowParseResult {
  const raw = (body ?? {}) as Record<string, unknown>;
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const mode = raw.mode === "variation" ? "variation" : raw.mode === "create" ? "create" : null;
  if (!key || !label || !mode) {
    return { ok: false, error: "invalid_workflow" };
  }
  const workflowId = typeof raw.workflow_id === "string" ? raw.workflow_id.trim() : "";
  const promptNodeId = typeof raw.prompt_node_id === "string" ? raw.prompt_node_id.trim() : "";
  const promptFieldName =
    typeof raw.prompt_field_name === "string" && raw.prompt_field_name.trim()
      ? raw.prompt_field_name.trim()
      : "text";
  const checkpointNodeId =
    typeof raw.checkpoint_node_id === "string" && raw.checkpoint_node_id.trim()
      ? raw.checkpoint_node_id.trim()
      : null;
  const checkpointFieldName =
    typeof raw.checkpoint_field_name === "string" && raw.checkpoint_field_name.trim()
      ? raw.checkpoint_field_name.trim()
      : "ckpt_name";
  const loadImageNodeId =
    typeof raw.load_image_node_id === "string" && raw.load_image_node_id.trim()
      ? raw.load_image_node_id.trim()
      : null;
  const modelIds = Array.isArray(raw.model_ids)
    ? raw.model_ids.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)
    : [];
  return {
    ok: true,
    value: {
      checkpoint_field_name: checkpointFieldName,
      checkpoint_node_id: checkpointNodeId,
      is_active: raw.is_active === undefined ? true : Boolean(raw.is_active),
      key,
      label,
      load_image_node_id: loadImageNodeId,
      mode,
      model_ids: [...new Set(modelIds)],
      prompt_field_name: promptFieldName,
      prompt_node_id: promptNodeId,
      sort_order: readNumber(raw.sort_order),
      workflow_id: workflowId,
    },
  };
}

function readNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
