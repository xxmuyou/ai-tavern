import { mockImageGenProvider } from "./mock-provider";
import type { ImageGenProvider } from "./types";

export {
  type CompanionPromptContext,
  type ImageGenProvider,
  type ImageGenRequest,
  type ImageGenResponse,
  type NonNeutralEmotion,
  ImageGenError,
  NON_NEUTRAL_EMOTIONS,
} from "./types";
export { buildEmotionPrompt } from "./prompts";

/**
 * Return the active image-gen provider for the current environment.
 *
 * Currently always returns the mock provider (spec-020 first cut). When a
 * real provider lands (OpenAI gpt-image-1, etc.), this can branch on
 * env.IMAGE_GEN_PROVIDER or similar without callers having to change.
 */
export function getImageGenProvider(_env: Env): ImageGenProvider {
  return mockImageGenProvider;
}
