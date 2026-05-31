import { estimateCost } from "./cost";
import { writeLLMLog } from "./logs";
import { deepseekProvider, DEEPSEEK_BASE_URL } from "./providers/deepseek";
import { openaiProvider } from "./providers/openai";
import { getSetting } from "../settings/store";
import {
  LLMError,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
  type LLMStreamChunk,
  type LLMTask,
  type ProviderConfig,
  type ProviderImpl,
} from "./types";

type LLMConfigRow = {
  task: LLMTask;
  provider: LLMProvider;
  model: string;
  fallback_provider: LLMProvider | null;
  fallback_model: string | null;
};

type LLMCallOptions = {
  /** Attach to the llm_logs entry. Null/undefined for system-initiated calls. */
  user_id?: string | null;
};

type RouteResolution = {
  primary: { provider: LLMProvider; model: string };
  fallback?: { provider: LLMProvider; model: string };
};

const PROVIDERS: Record<string, ProviderImpl> = {
  deepseek: deepseekProvider,
  openai: openaiProvider,
};

export class LLMRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMRouterError";
  }
}

export async function llmCall(
  env: Env,
  request: LLMRequest,
  options: LLMCallOptions = {},
): Promise<LLMResponse> {
  const route = await resolveRoute(env, request.task);
  const userId = options.user_id ?? null;

  try {
    const response = await invokeProvider(env, request, route.primary);
    void writeLLMLog(env, {
      cost_usd: response.cost_usd,
      error_code: null,
      error_message: null,
      latency_ms: response.latency_ms,
      model: response.model,
      provider: response.provider,
      status: "success",
      task: request.task,
      token_input: response.usage.input_tokens,
      token_output: response.usage.output_tokens,
      user_id: userId,
    });
    return response;
  } catch (primaryErr) {
    const llmErr = toLLMError(primaryErr);
    if (route.fallback && llmErr.retryable) {
      void writeLLMLog(env, {
        cost_usd: null,
        error_code: llmErr.code,
        error_message: llmErr.message,
        latency_ms: null,
        model: route.primary.model,
        provider: route.primary.provider,
        status: "fallback",
        task: request.task,
        token_input: null,
        token_output: null,
        user_id: userId,
      });
      try {
        const response = await invokeProvider(env, request, route.fallback);
        void writeLLMLog(env, {
          cost_usd: response.cost_usd,
          error_code: null,
          error_message: null,
          latency_ms: response.latency_ms,
          model: response.model,
          provider: response.provider,
          status: "success",
          task: request.task,
          token_input: response.usage.input_tokens,
          token_output: response.usage.output_tokens,
          user_id: userId,
        });
        return response;
      } catch (fallbackErr) {
        const finalErr = toLLMError(fallbackErr);
        void writeLLMLog(env, {
          cost_usd: null,
          error_code: finalErr.code,
          error_message: finalErr.message,
          latency_ms: null,
          model: route.fallback.model,
          provider: route.fallback.provider,
          status: "error",
          task: request.task,
          token_input: null,
          token_output: null,
          user_id: userId,
        });
        throw finalErr;
      }
    }

    void writeLLMLog(env, {
      cost_usd: null,
      error_code: llmErr.code,
      error_message: llmErr.message,
      latency_ms: null,
      model: route.primary.model,
      provider: route.primary.provider,
      status: "error",
      task: request.task,
      token_input: null,
      token_output: null,
      user_id: userId,
    });
    throw llmErr;
  }
}

export async function* llmStream(
  env: Env,
  request: LLMRequest,
  options: LLMCallOptions = {},
): AsyncIterable<LLMStreamChunk> {
  const route = await resolveRoute(env, request.task);
  const userId = options.user_id ?? null;
  const start = Date.now();
  const target = await pickStreamingTarget(env, route, request);

  let primaryFailed = false;
  if ("error" in target) {
    primaryFailed = true;
    void writeLLMLog(env, {
      cost_usd: null,
      error_code: target.error.code,
      error_message: target.error.message,
      latency_ms: null,
      model: route.primary.model,
      provider: route.primary.provider,
      status: "fallback",
      task: request.task,
      token_input: null,
      token_output: null,
      user_id: userId,
    });
  }

  const active =
    "error" in target
      ? (route.fallback ?? route.primary)
      : route.primary;

  const iterator = "iterator" in target ? target.iterator : (await openStream(env, request, active));
  if (iterator === null) {
    throw new LLMError("server_error", "no provider stream available");
  }

  try {
    for await (const chunk of iterator) {
      if (chunk.type === "done") {
        void writeLLMLog(env, {
          cost_usd: estimateUsageCost(active, chunk.usage),
          error_code: null,
          error_message: null,
          latency_ms: Date.now() - start,
          model: active.model,
          provider: active.provider,
          status: primaryFailed ? "fallback" : "success",
          task: request.task,
          token_input: chunk.usage.input_tokens,
          token_output: chunk.usage.output_tokens,
          user_id: userId,
        });
      }
      yield chunk;
    }
  } catch (err) {
    const llmErr = toLLMError(err);
    void writeLLMLog(env, {
      cost_usd: null,
      error_code: llmErr.code,
      error_message: llmErr.message,
      latency_ms: Date.now() - start,
      model: active.model,
      provider: active.provider,
      status: "error",
      task: request.task,
      token_input: null,
      token_output: null,
      user_id: userId,
    });
    throw llmErr;
  }
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

async function resolveRoute(env: Env, task: LLMTask): Promise<RouteResolution> {
  const row = await env.DB.prepare(
    `SELECT task, provider, model, fallback_provider, fallback_model
     FROM llm_config
     WHERE task = ?`,
  )
    .bind(task)
    .first<LLMConfigRow>();

  if (!row) {
    throw new LLMRouterError(`llm_config missing entry for task '${task}'`);
  }

  const route: RouteResolution = {
    primary: { model: row.model, provider: row.provider },
  };
  if (row.fallback_provider && row.fallback_model) {
    route.fallback = { model: row.fallback_model, provider: row.fallback_provider };
  }
  return route;
}

/**
 * Invoke a single provider directly, bypassing `llm_config` routing and
 * `llm_logs` writes. Used by admin "try-it" tooling (see `admin.ts`) where
 * we want to test a provider/model combo without polluting production stats.
 */
export async function invokeProvider(
  env: Env,
  request: LLMRequest,
  target: { provider: LLMProvider; model: string },
): Promise<LLMResponse> {
  const provider = PROVIDERS[target.provider];
  if (!provider) {
    throw new LLMError("config_error", `provider '${target.provider}' is not wired up in v1`);
  }
  const config = await buildProviderConfig(env, target.provider, target.model);
  return provider.call(config, request);
}

async function openStream(
  env: Env,
  request: LLMRequest,
  target: { provider: LLMProvider; model: string },
): Promise<AsyncIterable<LLMStreamChunk>> {
  const provider = PROVIDERS[target.provider];
  if (!provider) {
    throw new LLMError("config_error", `provider '${target.provider}' is not wired up in v1`);
  }
  const config = await buildProviderConfig(env, target.provider, target.model);
  return provider.stream(config, request);
}

async function pickStreamingTarget(
  env: Env,
  route: RouteResolution,
  request: LLMRequest,
): Promise<
  | { iterator: AsyncIterable<LLMStreamChunk> }
  | { error: LLMError }
> {
  try {
    const iterator = await openStream(env, request, route.primary);
    return { iterator };
  } catch (err) {
    const llmErr = toLLMError(err);
    if (route.fallback && llmErr.retryable) {
      return { error: llmErr };
    }
    throw llmErr;
  }
}

async function buildProviderConfig(
  env: Env,
  provider: LLMProvider,
  model: string,
): Promise<ProviderConfig> {
  switch (provider) {
    case "deepseek":
      return {
        apiKey: await readApiKey(env, "DEEPSEEK_API_KEY"),
        baseURL: DEEPSEEK_BASE_URL,
        model,
        provider,
      };
    case "openai":
      return {
        apiKey: await readApiKey(env, "OPENAI_API_KEY"),
        model,
        provider,
      };
    default:
      throw new LLMError("config_error", `provider '${provider}' is not wired up in v1 (spec-002)`);
  }
}

async function readApiKey(env: Env, key: "DEEPSEEK_API_KEY" | "OPENAI_API_KEY"): Promise<string> {
  const settingKey = key === "DEEPSEEK_API_KEY" ? "llm.deepseek_api_key" : "llm.openai_api_key";
  const value = await getSetting(env, settingKey);
  if (!value || value.length === 0) {
    throw new LLMError("config_error", `${key} is not configured`);
  }
  return value;
}

function toLLMError(err: unknown): LLMError {
  if (err instanceof LLMError) return err;
  if (err instanceof LLMRouterError) return new LLMError("config_error", err.message, { retryable: false });
  if (err instanceof Error) return new LLMError("unknown", err.message);
  return new LLMError("unknown", String(err));
}

function estimateUsageCost(
  target: { provider: LLMProvider; model: string },
  usage: { input_tokens: number; output_tokens: number },
): number {
  return estimateCost(target.provider, target.model, usage);
}
