import type { ProviderImpl } from "../types";
import { openAICall, openAIStream } from "./openai-shared";

/**
 * MiniMax exposes an OpenAI-compatible chat/completions API. Use the `.com`
 * endpoint from the official docs; do not switch this to api.minimax.io.
 */
export const minimaxProvider: ProviderImpl = {
  call: openAICall,
  name: "minimax",
  stream: openAIStream,
};

export const MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";
