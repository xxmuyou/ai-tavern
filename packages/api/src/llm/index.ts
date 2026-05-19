import { normalizeEmail, type UserRecord } from "../identity";

export const ADMIN_EMAIL = "admin@aiappsbox.com";
const DEFAULT_ROUTE = "cheap-dialogue";
const DEFAULT_MAX_OUTPUT_TOKENS = 160;
const DEFAULT_TEMPERATURE = 0.7;

type LlmEnv = Env & {
  ARK_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  LLM_DEFAULT_ROUTE?: string;
  OPENAI_API_KEY?: string;
};

export type LlmMessage = {
  content: string;
  role: "assistant" | "system" | "user";
};

export type LlmMetadata = {
  appKey?: string;
  purpose?: string;
  sessionId?: string;
  showKey?: string;
  stageKey?: string;
  userId?: string;
};

export type LlmGenerateInput = {
  fallbackText: string;
  maxTextLength?: number;
  maxOutputTokens?: number;
  messages: LlmMessage[];
  metadata?: LlmMetadata;
  onDelta?: (text: string) => void | Promise<void>;
  route?: string;
  stream?: boolean;
  temperature?: number;
};

export type LlmUsage = {
  completionTokens: number | null;
  promptTokens: number | null;
  totalTokens: number | null;
};

export type LlmGenerateResult = {
  estimatedCostUsd: number | null;
  fallbackUsed: boolean;
  model: string | null;
  provider: string | null;
  text: string;
  usage: LlmUsage;
};

type LlmProviderKey = "deepseek" | "doubao" | "openai";

type RouteConfig = {
  providerModels: Record<string, string>;
  providerOrder: string[];
  routeKey: string;
  status: "active" | "hidden" | "retired";
};

type RouteConfigRow = {
  provider_models: string;
  provider_order: string;
  route_key: string;
  status: "active" | "hidden" | "retired";
};

type ChatCompletionResponse = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  error?: {
    code?: string;
    message?: string;
  };
  usage?: {
    completion_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
};

type ChatCompletionStreamChunk = {
  choices?: {
    delta?: {
      content?: string;
    };
  }[];
  error?: {
    code?: string;
    message?: string;
  };
  usage?: ChatCompletionResponse["usage"];
};

type ProviderDefinition = {
  baseUrl: string;
  defaultModel: string;
  getApiKey: (env: LlmEnv) => string | undefined;
  key: LlmProviderKey;
  outputUsdPer1M: number | null;
  inputUsdPer1M: number | null;
};

const PROVIDERS: Record<LlmProviderKey, ProviderDefinition> = {
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    getApiKey: (env) => env.DEEPSEEK_API_KEY,
    inputUsdPer1M: null,
    key: "deepseek",
    outputUsdPer1M: null,
  },
  doubao: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-1-6-250615",
    getApiKey: (env) => env.ARK_API_KEY,
    inputUsdPer1M: null,
    key: "doubao",
    outputUsdPer1M: null,
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5-mini",
    getApiKey: (env) => env.OPENAI_API_KEY,
    inputUsdPer1M: null,
    key: "openai",
    outputUsdPer1M: null,
  },
};

const DEFAULT_ROUTE_CONFIG: RouteConfig = {
  providerModels: {
    deepseek: PROVIDERS.deepseek.defaultModel,
    doubao: PROVIDERS.doubao.defaultModel,
    openai: PROVIDERS.openai.defaultModel,
  },
  providerOrder: ["deepseek", "doubao"],
  routeKey: DEFAULT_ROUTE,
  status: "active",
};

export async function generateText(env: Env, input: LlmGenerateInput): Promise<LlmGenerateResult> {
  const llmEnv = env as LlmEnv;
  const routeKey = normalizeRouteKey(input.route || llmEnv.LLM_DEFAULT_ROUTE || DEFAULT_ROUTE);
  const routeConfig = await getRouteConfig(llmEnv, routeKey);
  const route = routeConfig.status === "active" ? routeConfig : DEFAULT_ROUTE_CONFIG;
  const started = Date.now();
  let lastErrorCode: string | null = null;

  for (const providerKey of route.providerOrder) {
    if (!isProviderKey(providerKey)) {
      lastErrorCode = "unknown_provider";
      continue;
    }

    const provider = PROVIDERS[providerKey];
    const apiKey = provider.getApiKey(llmEnv);
    const model = route.providerModels[providerKey] || provider.defaultModel;

    if (!apiKey) {
      await logGeneration(llmEnv, {
        estimatedCostUsd: null,
        errorCode: "missing_api_key",
        input,
        latencyMs: Date.now() - started,
        model,
        provider: provider.key,
        routeKey: route.routeKey,
        status: "skipped",
        usage: emptyUsage(),
      });
      lastErrorCode = "missing_api_key";
      continue;
    }

    const attemptStarted = Date.now();
    try {
      const response = input.stream
        ? await callOpenAiCompatibleChatStream(provider, apiKey, model, input)
        : await callOpenAiCompatibleChat(provider, apiKey, model, input);
      const text = normalizeGeneratedText(extractChatText(response), input.fallbackText, input.maxTextLength);
      const usage = normalizeUsage(response.usage);
      const estimatedCostUsd = estimateCost(provider, usage);

      await logGeneration(llmEnv, {
        estimatedCostUsd,
        errorCode: null,
        input,
        latencyMs: Date.now() - attemptStarted,
        model,
        provider: provider.key,
        routeKey: route.routeKey,
        status: "success",
        usage,
      });

      return {
        estimatedCostUsd,
        fallbackUsed: false,
        model,
        provider: provider.key,
        text,
        usage,
      };
    } catch (error) {
      lastErrorCode = error instanceof LlmProviderError ? error.code : "provider_error";
      await logGeneration(llmEnv, {
        estimatedCostUsd: null,
        errorCode: lastErrorCode,
        input,
        latencyMs: Date.now() - attemptStarted,
        model,
        provider: provider.key,
        routeKey: route.routeKey,
        status: "failed",
        usage: emptyUsage(),
      });
      console.error(
        JSON.stringify({
          error: String(error),
          message: "LLM provider failed",
          provider: provider.key,
          routeKey: route.routeKey,
        }),
      );
    }
  }

  await logGeneration(llmEnv, {
    estimatedCostUsd: null,
    errorCode: lastErrorCode || "no_available_provider",
    input,
    latencyMs: Date.now() - started,
    model: null,
    provider: null,
    routeKey: route.routeKey,
    status: "fallback",
    usage: emptyUsage(),
  });

  if (input.stream && input.onDelta) {
    await emitStreamText(input.fallbackText, input.onDelta);
  }

  return {
    estimatedCostUsd: null,
    fallbackUsed: true,
    model: null,
    provider: null,
    text: input.fallbackText,
    usage: emptyUsage(),
  };
}

export async function getAdminRouteConfig(env: Env, routeKey = DEFAULT_ROUTE) {
  const config = await getRouteConfig(env as LlmEnv, normalizeRouteKey(routeKey));
  return serializeRouteConfig(config);
}

export async function updateAdminRouteConfig(
  env: Env,
  input: {
    providerModels?: Record<string, string>;
    providerOrder?: string[];
    routeKey?: string;
    updatedBy: UserRecord;
  },
) {
  const routeKey = normalizeRouteKey(input.routeKey || DEFAULT_ROUTE);
  const current = await getRouteConfig(env as LlmEnv, routeKey);
  const providerOrder = normalizeProviderOrder(input.providerOrder ?? current.providerOrder);
  const providerModels = normalizeProviderModels({
    ...current.providerModels,
    ...(input.providerModels ?? {}),
  });

  await env.DB.prepare(
    `INSERT INTO llm_model_routes (
       route_key,
       description,
       provider_order,
       provider_models,
       status,
       updated_by_user_id,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(route_key) DO UPDATE SET
       provider_order = excluded.provider_order,
       provider_models = excluded.provider_models,
       status = excluded.status,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      routeKey,
      routeKey === DEFAULT_ROUTE ? DEFAULT_ROUTE_CONFIG_DESCRIPTION : "",
      JSON.stringify(providerOrder),
      JSON.stringify(providerModels),
      "active",
      input.updatedBy.id,
    )
    .run();

  return getAdminRouteConfig(env, routeKey);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === ADMIN_EMAIL;
}

const DEFAULT_ROUTE_CONFIG_DESCRIPTION = "Low-cost text route for AI Companion character and narrator dialogue.";

async function getRouteConfig(env: LlmEnv, routeKey: string): Promise<RouteConfig> {
  try {
    const row = await env.DB.prepare(
      `SELECT route_key, provider_order, provider_models, status
       FROM llm_model_routes
       WHERE route_key = ?`,
    )
      .bind(routeKey)
      .first<RouteConfigRow>();

    if (!row) {
      return { ...DEFAULT_ROUTE_CONFIG, routeKey };
    }

    return {
      providerModels: normalizeProviderModels(readJsonObject(row.provider_models)),
      providerOrder: normalizeProviderOrder(readJsonArray(row.provider_order)),
      routeKey: row.route_key,
      status: row.status,
    };
  } catch (error) {
    console.error(JSON.stringify({ error: String(error), message: "LLM route config lookup failed" }));
    return { ...DEFAULT_ROUTE_CONFIG, routeKey };
  }
}

async function callOpenAiCompatibleChat(
  provider: ProviderDefinition,
  apiKey: string,
  model: string,
  input: LlmGenerateInput,
): Promise<ChatCompletionResponse> {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    body: JSON.stringify({
      max_tokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      messages: input.messages,
      model,
      stream: false,
      temperature: input.temperature ?? DEFAULT_TEMPERATURE,
    }),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  const data = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
  if (!response.ok) {
    throw new LlmProviderError(data.error?.code || `http_${response.status}`, data.error?.message || "LLM request failed");
  }

  return data;
}

async function callOpenAiCompatibleChatStream(
  provider: ProviderDefinition,
  apiKey: string,
  model: string,
  input: LlmGenerateInput,
): Promise<ChatCompletionResponse> {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    body: JSON.stringify({
      max_tokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      messages: input.messages,
      model,
      stream: true,
      temperature: input.temperature ?? DEFAULT_TEMPERATURE,
    }),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
    throw new LlmProviderError(data.error?.code || `http_${response.status}`, data.error?.message || "LLM request failed");
  }

  if (!response.body) {
    throw new LlmProviderError("empty_stream", "LLM stream response was empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage: ChatCompletionResponse["usage"] | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const chunk = await parseStreamLine(line, input.onDelta);
        if (!chunk) {
          continue;
        }

        text += chunk.text;
        usage = chunk.usage ?? usage;
      }
    }

    if (buffer.trim()) {
      const chunk = await parseStreamLine(buffer, input.onDelta);
      if (chunk) {
        text += chunk.text;
        usage = chunk.usage ?? usage;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    choices: [{ message: { content: text } }],
    usage,
  };
}

async function parseStreamLine(
  line: string,
  onDelta: LlmGenerateInput["onDelta"],
): Promise<{ text: string; usage?: ChatCompletionResponse["usage"] } | null> {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data:")) {
    return null;
  }

  const data = trimmed.slice("data:".length).trim();
  if (!data || data === "[DONE]") {
    return null;
  }

  const parsed = JSON.parse(data) as ChatCompletionStreamChunk;
  if (parsed.error) {
    throw new LlmProviderError(parsed.error.code || "stream_error", parsed.error.message || "LLM stream failed");
  }

  const text = parsed.choices?.map((choice) => choice.delta?.content ?? "").join("") ?? "";
  if (text && onDelta) {
    await emitStreamText(text, onDelta);
  }

  return { text, usage: parsed.usage };
}

async function emitStreamText(
  text: string,
  onDelta: NonNullable<LlmGenerateInput["onDelta"]>,
): Promise<void> {
  for (const chunk of splitStreamText(text)) {
    if (chunk) {
      await onDelta(chunk);
    }
  }
}

function splitStreamText(text: string): string[] {
  if (text.length <= 36) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 24) {
    const breakAt = Math.max(
      remaining.lastIndexOf(" ", 24),
      remaining.lastIndexOf("\n", 24),
    );
    const end = breakAt > 8 ? breakAt + 1 : 24;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

async function logGeneration(
  env: LlmEnv,
  input: {
    estimatedCostUsd: number | null;
    errorCode: string | null;
    input: LlmGenerateInput;
    latencyMs: number;
    model: string | null;
    provider: string | null;
    routeKey: string;
    status: "failed" | "fallback" | "skipped" | "success";
    usage: LlmUsage;
  },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO llm_generation_logs (
         id,
         route_key,
         provider,
         model,
         app_key,
         show_key,
         session_id,
         user_id,
         purpose,
         status,
         prompt_tokens,
         completion_tokens,
         total_tokens,
         estimated_cost_usd,
         latency_ms,
         error_code
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        input.routeKey,
        input.provider,
        input.model,
        input.input.metadata?.appKey ?? null,
        input.input.metadata?.showKey ?? null,
        input.input.metadata?.sessionId ?? null,
        input.input.metadata?.userId ?? null,
        input.input.metadata?.purpose ?? null,
        input.status,
        input.usage.promptTokens,
        input.usage.completionTokens,
        input.usage.totalTokens,
        input.estimatedCostUsd,
        input.latencyMs,
        input.errorCode,
      )
      .run();
  } catch (error) {
    console.error(JSON.stringify({ error: String(error), message: "LLM usage log failed" }));
  }
}

function extractChatText(data: ChatCompletionResponse): string | undefined {
  return data.choices?.[0]?.message?.content;
}

function normalizeGeneratedText(value: string | undefined, fallback: string, maxLength = 360): string {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function normalizeUsage(value: ChatCompletionResponse["usage"]): LlmUsage {
  const promptTokens = normalizeTokenCount(value?.prompt_tokens);
  const completionTokens = normalizeTokenCount(value?.completion_tokens ?? value?.output_tokens);
  const totalTokens = normalizeTokenCount(value?.total_tokens ?? sumNullable(promptTokens, completionTokens));

  return {
    completionTokens,
    promptTokens,
    totalTokens,
  };
}

function estimateCost(provider: ProviderDefinition, usage: LlmUsage): number | null {
  if (
    provider.inputUsdPer1M === null ||
    provider.outputUsdPer1M === null ||
    usage.promptTokens === null ||
    usage.completionTokens === null
  ) {
    return null;
  }

  return (
    (usage.promptTokens / 1_000_000) * provider.inputUsdPer1M +
    (usage.completionTokens / 1_000_000) * provider.outputUsdPer1M
  );
}

function emptyUsage(): LlmUsage {
  return {
    completionTokens: null,
    promptTokens: null,
    totalTokens: null,
  };
}

function normalizeTokenCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sumNullable(left: number | null, right: number | null): number | null {
  if (left === null || right === null) {
    return null;
  }

  return left + right;
}

function isProviderKey(value: string): value is LlmProviderKey {
  return value === "deepseek" || value === "doubao" || value === "openai";
}

function normalizeRouteKey(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,64}$/.test(normalized) ? normalized : DEFAULT_ROUTE;
}

function normalizeProviderOrder(value: string[]): string[] {
  const result = value.filter((provider) => isProviderKey(provider));
  return result.length ? result : DEFAULT_ROUTE_CONFIG.providerOrder;
}

function normalizeProviderModels(value: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [provider, model] of Object.entries(value)) {
    if (isProviderKey(provider) && typeof model === "string" && model.trim()) {
      result[provider] = model.trim().slice(0, 120);
    }
  }

  return {
    ...DEFAULT_ROUTE_CONFIG.providerModels,
    ...result,
  };
}

function readJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function serializeRouteConfig(config: RouteConfig) {
  return {
    providerModels: config.providerModels,
    providerOrder: config.providerOrder,
    routeKey: config.routeKey,
    status: config.status,
  };
}

class LlmProviderError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
