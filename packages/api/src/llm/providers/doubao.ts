import type { ProviderImpl } from "../types";
import { openAICall, openAIStream } from "./openai-shared";

/**
 * Doubao (ByteDance / Volcano Engine ARK) exposes an OpenAI-compatible
 * chat/completions API, so we reuse the shared implementation and only point
 * at the ARK v3 endpoint.
 *
 * Callers set config.baseURL = DOUBAO_BASE_URL when constructing the
 * ProviderConfig (router.ts does this). The model is the ARK model id (e.g.
 * "doubao-1.5-lite-32k") configured per task in the llm_config table.
 */
export const doubaoProvider: ProviderImpl = {
  call: openAICall,
  name: "doubao",
  stream: openAIStream,
};

export const DOUBAO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
