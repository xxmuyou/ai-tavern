import type { ProviderImpl } from "../types";
import { openAICall, openAIStream } from "./openai-shared";

export const openaiProvider: ProviderImpl = {
  call: openAICall,
  name: "openai",
  stream: openAIStream,
};
