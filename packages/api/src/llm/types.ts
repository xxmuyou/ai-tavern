export const LLM_TASKS = [
  "chat",
  "signal",
  "summary",
  "memory_extract",
  "character-assist",
  "image_prompt_assist",
  "story_beat_assist",
  // Life-sim v1 (worktree A: feat/life-core). Both are system-initiated and
  // never consume the user's daily message quota.
  "daily_state_flavor",
  "memory_summary",
] as const;
export type LLMTask = (typeof LLM_TASKS)[number];

export const LLM_PROVIDERS = ["deepseek", "openai", "anthropic", "doubao", "cloudflare", "minimax"] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];

export type LLMRole = "system" | "user" | "assistant";

export type LLMMessage = {
  role: LLMRole;
  content: string;
};

export type LLMUsage = {
  input_tokens: number;
  output_tokens: number;
};

export type LLMRequest = {
  task: LLMTask;
  messages: LLMMessage[];
  /**
   * If supplied, ask the provider for a JSON response that matches this
   * schema. Providers map this to their native JSON mode.
   */
  json_schema?: Record<string, unknown>;
  /** Hard cap on output tokens; provider-specific defaults apply if absent. */
  max_tokens?: number;
  /** Sampling temperature; provider-specific defaults apply if absent. */
  temperature?: number;
  /** Nucleus sampling; provider-specific defaults apply if absent. */
  top_p?: number;
  /** Penalize repeated tokens to reduce samey phrasing; default if absent. */
  frequency_penalty?: number;
  /** Penalize already-present tokens to nudge novelty; default if absent. */
  presence_penalty?: number;
};

export type LLMResponse = {
  text: string;
  /** Parsed JSON if json_schema was set and the provider returned valid JSON. */
  structured?: unknown;
  usage: LLMUsage;
  provider: LLMProvider;
  model: string;
  /** Total cost of the call in USD, computed from usage + cost table. */
  cost_usd: number;
  /** Time spent waiting on the provider (ms). */
  latency_ms: number;
};

export type LLMStreamChunk =
  | { type: "text"; text: string }
  | { type: "done"; usage: LLMUsage; structured?: unknown };

export type LLMErrorCode =
  | "rate_limit"
  | "server_error"
  | "config_error"
  | "timeout"
  | "content_filter"
  | "unknown";

export class LLMError extends Error {
  readonly code: LLMErrorCode;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(code: LLMErrorCode, message: string, options?: { status?: number; retryable?: boolean }) {
    super(message);
    this.name = "LLMError";
    this.code = code;
    this.status = options?.status;
    this.retryable = options?.retryable ?? defaultRetryable(code);
  }
}

function defaultRetryable(code: LLMErrorCode): boolean {
  switch (code) {
    case "rate_limit":
    case "server_error":
    case "timeout":
    case "unknown":
      return true;
    case "config_error":
    case "content_filter":
      return false;
  }
}

export type ProviderConfig = {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
};

export type ProviderImpl = {
  name: LLMProvider;
  call(config: ProviderConfig, request: LLMRequest): Promise<LLMResponse>;
  stream(config: ProviderConfig, request: LLMRequest): AsyncIterable<LLMStreamChunk>;
};
