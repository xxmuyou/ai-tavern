import type { LlmProvider } from '@/api/types';

// Mirrors LLM_PROVIDERS in packages/api/src/llm/types.ts. Keep in sync when the
// backend adds a provider. The task list is not mirrored here — it comes from
// GET /admin/llm/config at runtime.
export const LLM_PROVIDERS: readonly LlmProvider[] = [
  'deepseek',
  'openai',
  'anthropic',
  'doubao',
  'cloudflare',
  'minimax',
];

/**
 * Quick-pick model ids per provider for the admin model dropdowns. These are
 * convenience shortcuts only — the model picker keeps a free-text input, so any
 * id not listed here can still be typed in. All ids for a provider share that
 * provider's single OpenAI-compatible endpoint; selecting one is how the task's
 * model (and thus its pricing/behaviour) is chosen.
 *
 * NOTE: deepseek exposes only `deepseek-chat` (V3, cheap/general) and
 * `deepseek-reasoner` (R1) as stable ids. doubao (Volcengine ARK) and minimax
 * ids should be verified against the account console — correct them here or via
 * the custom input if the platform uses dated/endpoint ids.
 */
export const DEFAULT_LLM_MODELS: Partial<Record<LlmProvider, string[]>> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-5-mini'],
  doubao: ['doubao-1.5-lite-32k', 'doubao-1.5-pro-32k', 'doubao-1.5-pro-256k', 'doubao-seed-1.6'],
  minimax: ['MiniMax-M3', 'MiniMax-Text-01', 'abab6.5s-chat'],
};
