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
