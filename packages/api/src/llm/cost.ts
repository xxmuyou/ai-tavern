import type { LLMProvider, LLMUsage } from "./types";

type Price = {
  /** USD per input token (cache-miss for DeepSeek). */
  input: number;
  /** USD per output token. */
  output: number;
};

const PER_TOKEN = (perMillion: { input: number; output: number }): Price => ({
  input: perMillion.input / 1_000_000,
  output: perMillion.output / 1_000_000,
});

// Per-million-token pricing as of 2026-05. Treat as a baseline that needs
// occasional refresh; the docs/architecture/llm.md §7 table is the source of
// truth for budgeting.
export const PRICING: Record<string, Price> = {
  "anthropic:claude-haiku-4-5": PER_TOKEN({ input: 1.0, output: 5.0 }),
  "cloudflare:@cf/meta/llama-3.1-8b-instruct": PER_TOKEN({ input: 0.05, output: 0.05 }),
  "deepseek:deepseek-chat": PER_TOKEN({ input: 0.14, output: 0.28 }),
  "doubao:doubao-1.5-lite-32k": PER_TOKEN({ input: 0.04, output: 0.08 }),
  "minimax:MiniMax-M3": PER_TOKEN({ input: 0.3, output: 1.2 }),
  "openai:gpt-4o-mini": PER_TOKEN({ input: 0.15, output: 0.6 }),
};

export function estimateCost(provider: LLMProvider, model: string, usage: LLMUsage): number {
  const price = PRICING[`${provider}:${model}`];
  if (!price) return 0;
  return usage.input_tokens * price.input + usage.output_tokens * price.output;
}
