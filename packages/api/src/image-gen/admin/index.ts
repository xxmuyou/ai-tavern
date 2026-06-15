import { requireAdminUser } from "../../auth";
import { jsonResponse } from "../../http";
import { loadUpdatedByEmails } from "../../llm/admin/repo";
import { resolveImageGenConfig } from "../../settings/store";
import {
  createImageModel,
  createImageLora,
  deleteImageWorkflow,
  deleteImageLora,
  deleteImageModel,
  isImageGenMode,
  listImageLoraRows,
  listImageModelRows,
  listImageWorkflowRows,
  normalizeArchitecture,
  updateImageLora,
  updateImageModel,
  upsertImageWorkflow,
  type ImageLoraInput,
  type ImageModelInput,
  type ImageWorkflowInput,
} from "../index";
import { normalizeWorkflowGenerationParams } from "../generation-params";
import { fetchRunningHubWorkflowContract, workflowContractHasField } from "../runninghub-contract";

/**
 * Admin workspace endpoints for image model catalog and retired expression
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
  if (pathname.startsWith("/admin/image-loras")) {
    return handleImageLoras(request, env, pathname);
  }
  if (pathname.startsWith("/admin/image-workflows")) {
    return handleImageWorkflows(request, env, pathname);
  }
  if (pathname.startsWith("/admin/expression-prompts")) {
    await requireAdminUser(env, request);
    return jsonResponse({ error: "feature_retired" }, { status: 410 });
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
  prompt_excerpt: string | null;
  error_code: string | null;
  error_message: string | null;
  provider_task_id: string | null;
  provider_submitted_at: number | null;
  provider_last_polled_at: number | null;
  provider_result_received_at: number | null;
  provider_task_cost_time_ms: number | null;
  provider_consume_coins: number | null;
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
  const rawCreatedFrom = Number(url.searchParams.get("created_from") ?? "");
  const rawCreatedTo = Number(url.searchParams.get("created_to") ?? "");
  const createdFrom = Number.isFinite(rawCreatedFrom) && rawCreatedFrom > 0 ? Math.trunc(rawCreatedFrom) : null;
  const createdTo = Number.isFinite(rawCreatedTo) && rawCreatedTo > 0 ? Math.trunc(rawCreatedTo) : null;

  const filters: string[] = [];
  const values: unknown[] = [];
  if (status && JOB_STATUSES.has(status)) {
    filters.push("status = ?");
    values.push(status);
  }
  if (createdFrom !== null) {
    filters.push("created_at >= ?");
    values.push(createdFrom);
  }
  if (createdTo !== null) {
    filters.push("created_at < ?");
    values.push(createdTo);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const sql = `SELECT id, status, task, workflow_key, model, provider,
                      SUBSTR(prompt, 1, 240) AS prompt_excerpt,
                      error_code, error_message,
                      provider_task_id,
                      provider_submitted_at, provider_last_polled_at, provider_result_received_at,
                      provider_task_cost_time_ms, provider_consume_coins,
                      created_at, completed_at
               FROM image_generation_jobs
               ${where}
               ORDER BY created_at DESC
               LIMIT ?`;
  const stmt = env.DB.prepare(sql).bind(...values, limit);
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

async function handleImageLoras(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/admin/image-loras" && request.method === "GET") {
    await requireAdminUser(env, request);
    const rows = await listImageLoraRows(env);
    const emails = await loadUpdatedByEmails(
      env,
      rows.map((r) => r.updated_by).filter((id): id is string => id !== null),
    );
    const loras = rows.map((r) => ({
      ...r,
      is_active: r.is_active === 1,
      updated_by_email: r.updated_by ? emails.get(r.updated_by) ?? null : null,
    }));
    return jsonResponse({ loras });
  }

  if (pathname === "/admin/image-loras" && request.method === "POST") {
    const admin = await requireAdminUser(env, request);
    const body = await request.json().catch(() => null);
    const parsed = parseLoraInput(body);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, { status: 400 });
    }
    const id = slugifyModelId(parsed.value.label);
    await createImageLora(env, id, parsed.value, admin.id);
    return jsonResponse({ id, ok: true }, { status: 201 });
  }

  const idMatch = pathname.match(/^\/admin\/image-loras\/([^/]+)$/);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1] ?? "");
    if (request.method === "PUT") {
      const admin = await requireAdminUser(env, request);
      const body = await request.json().catch(() => null);
      const parsed = parseLoraInput(body);
      if (!parsed.ok) {
        return jsonResponse({ error: parsed.error }, { status: 400 });
      }
      await updateImageLora(env, id, parsed.value, admin.id);
      return jsonResponse({ ok: true });
    }
    if (request.method === "DELETE") {
      await requireAdminUser(env, request);
      await deleteImageLora(env, id);
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
    const workflows = rows.map((r) => {
      const { architecture: _legacyArchitecture, ...workflow } = r;
      return {
        ...workflow,
        updated_by_email: r.updated_by ? emails.get(r.updated_by) ?? null : null,
      };
    });
    return jsonResponse({ workflows });
  }

  if (pathname === "/admin/image-workflows" && request.method === "POST") {
    const admin = await requireAdminUser(env, request);
    const body = await request.json().catch(() => null);
    const parsed = parseWorkflowInput(body);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, { status: 400 });
    }
    const prepared = await prepareWorkflowInput(env, parsed.value);
    if (!prepared.ok) {
      return jsonResponse({ error: prepared.error }, { status: 400 });
    }
    try {
      await upsertImageWorkflow(env, prepared.value, admin.id);
    } catch (error) {
      return jsonResponse(
        { error: "invalid_workflow_asset_binding", message: error instanceof Error ? error.message : String(error) },
        { status: 400 },
      );
    }
    return jsonResponse({ key: prepared.value.key, ok: true }, { status: 201 });
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
      const prepared = await prepareWorkflowInput(env, parsed.value);
      if (!prepared.ok) {
        return jsonResponse({ error: prepared.error }, { status: 400 });
      }
      try {
        await upsertImageWorkflow(env, prepared.value, admin.id);
      } catch (error) {
        return jsonResponse(
          { error: "invalid_workflow_asset_binding", message: error instanceof Error ? error.message : String(error) },
          { status: 400 },
        );
      }
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
  const architecture = readOptionalString(raw.architecture);
  try {
    normalizeArchitecture(architecture, "checkpoint architecture", { assetOnly: true, required: true });
  } catch {
    return { ok: false, error: "invalid_model_architecture" };
  }
  return {
    ok: true,
    value: {
      label,
      tag,
      ckpt_name: ckptName,
      architecture,
      purpose: readOptionalString(raw.purpose),
      style_family: readOptionalString(raw.style_family),
      tags: readOptionalString(raw.tags) || tag,
      is_active: raw.is_active === undefined ? true : Boolean(raw.is_active),
      sort_order: readNumber(raw.sort_order),
    },
  };
}

type LoraParseResult =
  | { ok: true; value: ImageLoraInput }
  | { ok: false; error: string };

function parseLoraInput(body: unknown): LoraParseResult {
  const raw = (body ?? {}) as Record<string, unknown>;
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const loraName = typeof raw.lora_name === "string" ? raw.lora_name.trim() : "";
  if (!label || !loraName) {
    return { ok: false, error: "invalid_lora" };
  }
  const clipStrengthRaw = raw.default_clip_strength;
  const clipStrength =
    clipStrengthRaw === null || clipStrengthRaw === undefined || clipStrengthRaw === ""
      ? null
      : readNumber(clipStrengthRaw);
  const architecture = readOptionalString(raw.architecture);
  try {
    normalizeArchitecture(architecture, "LoRA architecture", { assetOnly: true, required: true });
  } catch {
    return { ok: false, error: "invalid_lora_architecture" };
  }
  return {
    ok: true,
    value: {
      architecture,
      default_clip_strength: clipStrength,
      default_model_strength: readNumber(raw.default_model_strength) || 1,
      is_active: raw.is_active === undefined ? true : Boolean(raw.is_active),
      label,
      lora_name: loraName,
      purpose: readOptionalString(raw.purpose),
      sort_order: readNumber(raw.sort_order),
      style_family: readOptionalString(raw.style_family),
      tags: readOptionalString(raw.tags),
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
  const mode = isImageGenMode(raw.mode) ? raw.mode : null;
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
  const loadImageFieldName =
    typeof raw.load_image_field_name === "string" && raw.load_image_field_name.trim()
      ? raw.load_image_field_name.trim()
      : "image";
  if (mode === "cutout" && !loadImageNodeId) {
    return { ok: false, error: "cutout_load_image_node_required" };
  }
  const negativePromptNodeId =
    typeof raw.negative_prompt_node_id === "string" && raw.negative_prompt_node_id.trim()
      ? raw.negative_prompt_node_id.trim()
      : null;
  const negativePromptFieldName =
    typeof raw.negative_prompt_field_name === "string" && raw.negative_prompt_field_name.trim()
      ? raw.negative_prompt_field_name.trim()
      : "prompt";
  const loraNodeId =
    typeof raw.lora_node_id === "string" && raw.lora_node_id.trim()
      ? raw.lora_node_id.trim()
      : null;
  const loraNameFieldName =
    typeof raw.lora_name_field_name === "string" && raw.lora_name_field_name.trim()
      ? raw.lora_name_field_name.trim()
      : "lora_name";
  const loraModelStrengthFieldName =
    typeof raw.lora_model_strength_field_name === "string" && raw.lora_model_strength_field_name.trim()
      ? raw.lora_model_strength_field_name.trim()
      : "strength_model";
  const loraClipStrengthFieldName =
    typeof raw.lora_clip_strength_field_name === "string" && raw.lora_clip_strength_field_name.trim()
      ? raw.lora_clip_strength_field_name.trim()
      : null;
  const generationParamsJson = readGenerationParamsJson(raw.generation_params_json);
  if (generationParamsJson === false) {
    return { ok: false, error: "invalid_generation_params" };
  }
  const modelIds = Array.isArray(raw.model_ids)
    ? raw.model_ids.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)
    : [];
  const loraBindings = Array.isArray(raw.lora_bindings)
    ? raw.lora_bindings
        .map((binding) => {
          const item = binding && typeof binding === "object" && !Array.isArray(binding)
            ? (binding as Record<string, unknown>)
            : {};
          const modelId = typeof item.model_id === "string" ? item.model_id.trim() : "";
          const loraIds = Array.isArray(item.lora_ids)
            ? item.lora_ids.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)
            : [];
          return modelId ? { lora_ids: [...new Set(loraIds)], model_id: modelId } : null;
        })
        .filter((binding): binding is { model_id: string; lora_ids: string[] } => binding != null)
    : [];
  return {
    ok: true,
    value: {
      checkpoint_field_name: checkpointFieldName,
      checkpoint_node_id: checkpointNodeId,
      is_active: raw.is_active === undefined ? true : Boolean(raw.is_active),
      key,
      label,
      load_image_field_name: loadImageFieldName,
      load_image_node_id: loadImageNodeId,
      lora_bindings: loraBindings,
      lora_clip_strength_field_name: loraClipStrengthFieldName,
      lora_model_strength_field_name: loraModelStrengthFieldName,
      lora_name_field_name: loraNameFieldName,
      lora_node_id: loraNodeId,
      generation_params_json: generationParamsJson,
      mode,
      model_ids: [...new Set(modelIds)],
      negative_prompt_field_name: negativePromptFieldName,
      negative_prompt_node_id: negativePromptNodeId,
      prompt_field_name: promptFieldName,
      prompt_node_id: promptNodeId,
      sort_order: readNumber(raw.sort_order),
      workflow_id: workflowId,
    },
  };
}

type WorkflowPrepareResult =
  | { ok: true; value: ImageWorkflowInput }
  | { ok: false; error: string };

async function prepareWorkflowInput(env: Env, input: ImageWorkflowInput): Promise<WorkflowPrepareResult> {
  if ((input.lora_bindings ?? []).some((binding) => binding.lora_ids.length > 0) && !input.lora_node_id) {
    return { ok: false, error: "lora_node_required" };
  }
  if (!input.workflow_id.trim()) {
    return {
      ok: true,
      value: {
        ...input,
        contract_hash: null,
        contract_json: null,
        contract_refreshed_at: null,
      },
    };
  }

  const cfg = await resolveImageGenConfig(env);
  let contract: { contractJson: string; contractHash: string };
  try {
    contract = await fetchRunningHubWorkflowContract({
      apiKey: cfg.apiKey,
      baseUrl: cfg.runninghubBaseUrl,
      workflowId: input.workflow_id,
    });
  } catch (error) {
    console.warn(
      `[admin/image-workflows] failed to refresh RunningHub workflow contract for ${input.key}:`,
      error,
    );
    return { ok: false, error: "workflow_contract_refresh_failed" };
  }

  const value: ImageWorkflowInput = {
    ...input,
    contract_hash: contract.contractHash,
    contract_json: contract.contractJson,
    contract_refreshed_at: Date.now(),
  };
  const validation = validateWorkflowInputAgainstContract(value);
  if (!validation.ok) return validation;
  return { ok: true, value };
}

function validateWorkflowInputAgainstContract(input: ImageWorkflowInput): WorkflowPrepareResult {
  const checks: Array<{ nodeId: string | null; fieldName: string | null; label: string }> = [
    { fieldName: input.prompt_field_name, label: "prompt", nodeId: input.prompt_node_id },
    { fieldName: input.checkpoint_field_name, label: "checkpoint", nodeId: input.checkpoint_node_id },
    { fieldName: input.load_image_field_name, label: "load_image", nodeId: input.load_image_node_id },
    {
      fieldName: input.negative_prompt_field_name,
      label: "negative_prompt",
      nodeId: input.negative_prompt_node_id,
    },
    { fieldName: input.lora_name_field_name, label: "lora_name", nodeId: input.lora_node_id },
    {
      fieldName: input.lora_model_strength_field_name,
      label: "lora_model_strength",
      nodeId: input.lora_node_id,
    },
    {
      fieldName: input.lora_clip_strength_field_name,
      label: "lora_clip_strength",
      nodeId: input.lora_node_id,
    },
  ];
  const generationParams = input.generation_params_json
    ? normalizeWorkflowGenerationParams(JSON.parse(input.generation_params_json))
    : null;
  if (generationParams?.latentNodeId) {
    checks.push(
      { fieldName: generationParams.widthFieldName ?? null, label: "latent_width", nodeId: generationParams.latentNodeId },
      { fieldName: generationParams.heightFieldName ?? null, label: "latent_height", nodeId: generationParams.latentNodeId },
      { fieldName: generationParams.batchSizeFieldName ?? null, label: "latent_batch_size", nodeId: generationParams.latentNodeId },
    );
  }
  if (generationParams?.ksamplerNodeId) {
    checks.push({
      fieldName: generationParams.seedFieldName ?? null,
      label: "ksampler_seed",
      nodeId: generationParams.ksamplerNodeId,
    });
  }

  for (const check of checks) {
    if (!check.nodeId?.trim()) continue;
    if (!workflowContractHasField(input.contract_json, check.nodeId, check.fieldName)) {
      return { ok: false, error: `workflow_contract_mismatch:${check.label}` };
    }
  }
  return { ok: true, value: input };
}

function readGenerationParamsJson(value: unknown): string | null | false {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return false;
  try {
    return JSON.stringify(normalizeWorkflowGenerationParams(JSON.parse(value)));
  } catch {
    return false;
  }
}

function readNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
