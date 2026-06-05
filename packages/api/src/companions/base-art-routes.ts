import { requireAuthUser } from "../auth";
import { jsonResponse } from "../http";
import type { UserRecord } from "../identity";
import { getImageModelSelection, ImageGenError, listActiveImageModels } from "../image-gen";
import {
  buildGenerationParamValues,
  parseWorkflowGenerationParams,
} from "../image-gen/generation-params";
import { LLMRouterError, llmCall } from "../llm";
import { LLMError } from "../llm/types";
import {
  type BaseArtSource,
  createBaseArtJob,
  loadBaseArtJob,
} from "../image-gen/base-art";

/**
 * spec-022 portrait_create — companion base-art draft, generated BEFORE the
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
      models: models.map((m) => ({
        checkpoint_applies: m.checkpoint_applies,
        ckpt_name: m.ckpt_name,
        id: m.id,
        label: m.label,
        loras: m.loras,
        generation_controls: m.generation_controls,
        model_id: m.model_id,
        tag: m.tag,
        workflow_key: m.workflow_key,
        workflow_label: m.workflow_label,
      })),
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

  if (pathname === "/companions/base-art/prompt-assist") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    const body = await request.json().catch(() => null);
    return handlePromptAssist(env, user, body);
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

async function handlePromptAssist(
  env: Env,
  user: UserRecord,
  body: unknown,
): Promise<Response> {
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const requestText = typeof raw.request === "string" ? raw.request.trim() : "";
  const modelLabel = typeof raw.model_label === "string" ? raw.model_label.trim() : "";
  if (!requestText) {
    return jsonResponse({ error: "request_required" }, { status: 400 });
  }
  if (requestText.length > 1200) {
    return jsonResponse({ error: "request_too_large" }, { status: 400 });
  }

  try {
    const response = await llmCall(
      env,
      {
        task: "image_prompt_assist",
        temperature: 0.55,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              "You write concise English image-generation prompts for AI companion character portraits. Return only one polished prompt. Do not add explanations, markdown, camera metadata labels, or safety disclaimers. Keep it under 90 words. Focus on appearance, outfit, mood, composition, and portrait style. Avoid naming copyrighted characters or real people.",
          },
          {
            role: "user",
            content: `User request: ${requestText}${modelLabel ? `\nSelected model/style: ${modelLabel}` : ""}`,
          },
        ],
      },
      { user_id: user.id },
    );
    return jsonResponse({ prompt: cleanPrompt(response.text) || fallbackPrompt(requestText) });
  } catch (err) {
    if (err instanceof LLMError || err instanceof LLMRouterError) {
      return jsonResponse({ prompt: fallbackPrompt(requestText), fallback: true });
    }
    throw err;
  }
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

  // A creator-selected workflow/model option resolves the workflow + checkpoint to run.
  if (typeof raw.model !== "string" || !raw.model.trim()) {
    return jsonResponse({ error: "invalid_model" }, { status: 400 });
  }
  const selection = await getImageModelSelection(env, raw.model.trim());
  if (!selection) {
    return jsonResponse({ error: "invalid_model" }, { status: 400 });
  }
  const workflowKey = selection.workflow.key;
  const ckptName = selection.model.ckpt_name;
  const checkpointFieldName = selection.workflow.checkpoint_field_name || "ckpt_name";
  const generationControls = parseWorkflowGenerationParams(selection.workflow.generation_params_json);

  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  const uploadKey = typeof raw.upload_key === "string" ? raw.upload_key.trim() : "";
  const loraId = typeof raw.lora_id === "string" ? raw.lora_id.trim() : "";
  const parsedParams = parseBaseArtGenerationParams(raw, generationControls);
  if (!parsedParams.ok) {
    return jsonResponse({ error: "invalid_generation_params" }, { status: 400 });
  }

  if (source === "text" && !prompt) {
    return jsonResponse({ error: "prompt_required" }, { status: 400 });
  }
  if (source === "upload" && !uploadKey) {
    return jsonResponse({ error: "upload_key_required" }, { status: 400 });
  }

  let jobId: string;
  try {
    jobId = await createBaseArtJob(env, {
      prompt: prompt || undefined,
      source: source as BaseArtSource,
      workflowKey,
      modelId: selection.model.id,
      ckptName,
      checkpointFieldName,
      loraId: loraId || null,
      generationParams: parsedParams.value,
      uploadKey: uploadKey || undefined,
      userId: user.id,
    });
  } catch (err) {
    if (err instanceof ImageGenError && err.code === "invalid_model_lora_combination") {
      return jsonResponse({ error: err.code }, { status: 400 });
    }
    throw err;
  }

  return jsonResponse({ job_id: jobId, status: "queued" }, { status: 202 });
}

function parseBaseArtGenerationParams(
  raw: Record<string, unknown>,
  controls: ReturnType<typeof parseWorkflowGenerationParams>,
): { ok: true; value: ReturnType<typeof buildGenerationParamValues> } | { ok: false } {
  if (!controls) return { ok: true, value: null };
  const sizePresetId = typeof raw.size_preset === "string" ? raw.size_preset.trim() : "";
  if (sizePresetId && !controls.sizePresets.some((preset) => preset.id === sizePresetId)) {
    return { ok: false };
  }
  const batchSize = readOptionalInteger(raw.batch_size);
  if (
    batchSize !== null &&
    (batchSize < controls.batchSizeMin || batchSize > controls.batchSizeMax)
  ) {
    return { ok: false };
  }
  const seed = readOptionalInteger(raw.seed);
  if (seed !== null && seed < 0) {
    return { ok: false };
  }
  return {
    ok: true,
    value: buildGenerationParamValues(controls, {
      batchSize,
      seed,
      sizePresetId,
    }),
  };
}

function readOptionalInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
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
    error_message: job.error_message ?? undefined,
    status: job.status,
  });
}

function cleanPrompt(value: string): string {
  return value
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^["']|["']$/g, "")
    .trim()
    .slice(0, 1000);
}

function fallbackPrompt(requestText: string): string {
  return [
    requestText,
    "original AI companion character portrait",
    "expressive face",
    "detailed outfit",
    "clean composition",
    "soft lighting",
  ].join(", ");
}
