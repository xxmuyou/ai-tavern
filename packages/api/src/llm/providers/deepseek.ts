import type { ProviderImpl } from "../types";
import { openAICall, openAIStream } from "./openai-shared";

/**
 * DeepSeek is wire-compatible with OpenAI's chat/completions API, so we reuse
 * the shared implementation and only point at https://api.deepseek.com/v1.
 *
 * Callers are expected to set config.baseURL = "https://api.deepseek.com/v1"
 * when constructing the ProviderConfig (router.ts does this).
 */
export const deepseekProvider: ProviderImpl = {
  call: openAICall,
  name: "deepseek",
  stream: openAIStream,
};

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
