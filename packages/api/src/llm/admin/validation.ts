import { jsonResponse } from "../../http";
import { LLM_PROVIDERS, LLM_TASKS, type LLMProvider, type LLMTask } from "../types";
import type { UsageWindow } from "./repo";

/**
 * Validation helpers used by the admin handlers. Each parser returns either a
 * typed value or a Response (400/404) the caller can return directly. We use
 * Response-as-error so handlers can `if (isResponse(parsed)) return parsed;`
 * without throwing through layers.
 */

export const PROMPT_MAX_BYTES = 4 * 1024;
const VALID_WINDOWS: ReadonlyArray<UsageWindow> = ["today", "7d", "30d"];

export type ConfigUpdateBody = {
  provider: LLMProvider;
  model: string;
  fallback_provider: LLMProvider | null;
  fallback_model: string | null;
};

export type TestCallBody = {
  task: LLMTask;
  prompt: string;
  override: { provider: LLMProvider; model: string } | null;
};

export function parseTask(raw: unknown): LLMTask | Response {
  if (typeof raw !== "string" || !isLLMTask(raw)) {
    return badRequest("task_not_found");
  }
  return raw;
}

export function parseProvider(raw: unknown): LLMProvider | Response {
  if (typeof raw !== "string" || !isLLMProvider(raw)) {
    return badRequest("unknown_provider");
  }
  return raw;
}

export function parseConfigUpdate(body: unknown): ConfigUpdateBody | Response {
  if (!isPlainObject(body)) {
    return badRequest("invalid_body");
  }

  const provider = parseProvider(body.provider);
  if (provider instanceof Response) return provider;

  const model = body.model;
  if (typeof model !== "string" || model.trim() === "") {
    return badRequest("unknown_model");
  }

  const fallback = parseOptionalFallback(body.fallback_provider, body.fallback_model);
  if (fallback instanceof Response) return fallback;

  return { provider, model: model.trim(), ...fallback };
}

export function parseTestCallBody(body: unknown): TestCallBody | Response {
  if (!isPlainObject(body)) {
    return badRequest("invalid_body");
  }

  const task = parseTask(body.task);
  if (task instanceof Response) return task;

  const prompt = body.prompt;
  if (typeof prompt !== "string" || prompt.trim() === "") {
    return badRequest("prompt_required");
  }
  if (byteLength(prompt) > PROMPT_MAX_BYTES) {
    return badRequest("prompt_too_large");
  }

  const override = parseOptionalOverride(body.provider, body.model);
  if (override instanceof Response) return override;

  return { task, prompt, override };
}

export function parseWindow(raw: string | null): UsageWindow | Response {
  if (raw === null || raw === "") {
    return "7d";
  }
  if (!VALID_WINDOWS.includes(raw as UsageWindow)) {
    return badRequest("invalid_window");
  }
  return raw as UsageWindow;
}

// -----------------------------------------------------------------------------

function parseOptionalFallback(
  providerRaw: unknown,
  modelRaw: unknown,
): Pick<ConfigUpdateBody, "fallback_provider" | "fallback_model"> | Response {
  const hasProvider = providerRaw !== undefined && providerRaw !== null;
  const hasModel = modelRaw !== undefined && modelRaw !== null;

  if (!hasProvider && !hasModel) {
    return { fallback_provider: null, fallback_model: null };
  }
  if (hasProvider !== hasModel) {
    return badRequest("invalid_fallback");
  }

  const provider = parseProvider(providerRaw);
  if (provider instanceof Response) return provider;

  if (typeof modelRaw !== "string" || modelRaw.trim() === "") {
    return badRequest("unknown_model");
  }
  return { fallback_provider: provider, fallback_model: modelRaw.trim() };
}

function parseOptionalOverride(
  providerRaw: unknown,
  modelRaw: unknown,
): { provider: LLMProvider; model: string } | null | Response {
  const hasProvider = providerRaw !== undefined && providerRaw !== null;
  const hasModel = modelRaw !== undefined && modelRaw !== null;

  if (!hasProvider && !hasModel) {
    return null;
  }
  if (hasProvider !== hasModel) {
    return badRequest("invalid_override");
  }

  const provider = parseProvider(providerRaw);
  if (provider instanceof Response) return provider;

  if (typeof modelRaw !== "string" || modelRaw.trim() === "") {
    return badRequest("unknown_model");
  }
  return { provider, model: modelRaw.trim() };
}

function isLLMTask(value: string): value is LLMTask {
  return (LLM_TASKS as ReadonlyArray<string>).includes(value);
}

function isLLMProvider(value: string): value is LLMProvider {
  return (LLM_PROVIDERS as ReadonlyArray<string>).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function badRequest(error: string): Response {
  return jsonResponse({ error }, { status: 400 });
}
