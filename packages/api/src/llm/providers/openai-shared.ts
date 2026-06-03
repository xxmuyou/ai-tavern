// Shared OpenAI-protocol client used by both the OpenAI and DeepSeek providers.
// DeepSeek's HTTP API is wire-compatible with OpenAI's chat/completions, so
// the only difference between the two is baseURL (and which API key is used).

import { estimateCost } from "../cost";
import {
  LLMError,
  type LLMMessage,
  type LLMRequest,
  type LLMResponse,
  type LLMStreamChunk,
  type LLMUsage,
  type ProviderConfig,
} from "../types";

const DEFAULT_TIMEOUT_MS = 30_000;

export async function openAICall(
  config: ProviderConfig,
  request: LLMRequest,
): Promise<LLMResponse> {
  const start = Date.now();
  const body = buildBody(config, request, false);
  const response = await fetchWithTimeout(
    `${baseURL(config)}/chat/completions`,
    {
      body: JSON.stringify(body),
      headers: buildHeaders(config),
      method: "POST",
    },
    DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw await translateHttpError(response);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  const usage: LLMUsage = {
    input_tokens: json.usage?.prompt_tokens ?? 0,
    output_tokens: json.usage?.completion_tokens ?? 0,
  };

  return finalize(config, text, usage, request, Date.now() - start);
}

export async function* openAIStream(
  config: ProviderConfig,
  request: LLMRequest,
): AsyncIterable<LLMStreamChunk> {
  const body = buildBody(config, request, true);
  const response = await fetchWithTimeout(
    `${baseURL(config)}/chat/completions`,
    {
      body: JSON.stringify(body),
      headers: buildHeaders(config),
      method: "POST",
    },
    DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw await translateHttpError(response);
  }

  if (!response.body) {
    throw new LLMError("server_error", "stream response had no body");
  }

  let usage: LLMUsage = { input_tokens: 0, output_tokens: 0 };
  let accumulated = "";

  type StreamEvent = {
    choices?: Array<{ delta?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  for await (const event of readSSE(response.body)) {
    if (event === "[DONE]") break;
    const parsed = safeParseJSON<StreamEvent>(event);
    if (!parsed) continue;
    const delta = parsed.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      accumulated += delta;
      yield { text: delta, type: "text" };
    }
    if (parsed.usage) {
      usage = {
        input_tokens: parsed.usage.prompt_tokens ?? 0,
        output_tokens: parsed.usage.completion_tokens ?? 0,
      };
    }
  }

  const structured = request.json_schema ? safeParseJSON(accumulated) : undefined;
  yield { structured: structured ?? undefined, type: "done", usage };
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function baseURL(config: ProviderConfig): string {
  return config.baseURL ?? "https://api.openai.com/v1";
}

function buildHeaders(config: ProviderConfig): Record<string, string> {
  if (!config.apiKey) {
    throw new LLMError("config_error", `missing api key for provider ${config.provider}`);
  }
  return {
    authorization: `Bearer ${config.apiKey}`,
    "content-type": "application/json",
  };
}

function buildBody(config: ProviderConfig, request: LLMRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messages: request.messages.map(sanitizeMessage),
    model: config.model,
    stream,
  };

  if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.top_p !== undefined) body.top_p = request.top_p;
  if (request.frequency_penalty !== undefined) body.frequency_penalty = request.frequency_penalty;
  if (request.presence_penalty !== undefined) body.presence_penalty = request.presence_penalty;

  if (stream) {
    body.stream_options = { include_usage: true };
  }

  if (request.json_schema) {
    // OpenAI supports strict json_schema; DeepSeek currently only supports
    // json_object. Use the structured form where supported, fall back to
    // json_object so the provider still returns valid JSON the caller can
    // parse client-side.
    if (config.provider === "openai") {
      body.response_format = {
        json_schema: { name: "response", schema: request.json_schema, strict: true },
        type: "json_schema",
      };
    } else {
      body.response_format = { type: "json_object" };
    }
  }

  return body;
}

function sanitizeMessage(message: LLMMessage): { role: string; content: string } {
  return { content: message.content, role: message.role };
}

function finalize(
  config: ProviderConfig,
  text: string,
  usage: LLMUsage,
  request: LLMRequest,
  latencyMs: number,
): LLMResponse {
  const structured = request.json_schema ? safeParseJSON(text) : undefined;
  return {
    cost_usd: estimateCost(config.provider, config.model, usage),
    latency_ms: latencyMs,
    model: config.model,
    provider: config.provider,
    structured: structured ?? undefined,
    text,
    usage,
  };
}

async function translateHttpError(response: Response): Promise<LLMError> {
  const body = await response.text().catch(() => "");
  const status = response.status;
  let message = `${status} ${response.statusText}`;
  if (body) message += ` :: ${body.slice(0, 500)}`;

  if (status === 429) {
    return new LLMError("rate_limit", message, { status });
  }
  if (status >= 500) {
    return new LLMError("server_error", message, { status });
  }
  if (status === 400 && body.toLowerCase().includes("content_policy")) {
    return new LLMError("content_filter", message, { status });
  }
  if (status === 401 || status === 403 || status === 404) {
    return new LLMError("config_error", message, { status });
  }
  return new LLMError("unknown", message, { status });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new LLMError("timeout", `request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, void> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let eventEnd: number;
      while ((eventEnd = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, eventEnd);
        buffer = buffer.slice(eventEnd + 2);
        const lines = block.split("\n");
        for (const rawLine of lines) {
          const line = rawLine.trimStart();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice("data:".length).trim();
          if (payload) yield payload;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function safeParseJSON<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
