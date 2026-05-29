import { mockImageGenProvider } from "./mock-provider";
import { runningHubImageGenProvider } from "./runninghub-provider";
import type { ImageGenProvider } from "./types";

export {
  type ArtStyle,
  type CompanionPromptContext,
  type CompletedImageGenResponse,
  type ImageGenMode,
  type ImageGenProvider,
  type ImageGenRequest,
  type ImageGenResponse,
  type NonNeutralEmotion,
  type PendingImageGenResponse,
  ART_STYLES,
  ImageGenError,
  NON_NEUTRAL_EMOTIONS,
  isArtStyle,
} from "./types";
export { buildEmotionPrompt } from "./prompts";

/**
 * Return the active image-gen provider for the current environment.
 *
 * Defaults to mock for local/CI unless explicitly configured otherwise.
 */
export function getImageGenProvider(env: Env): ImageGenProvider {
  const provider = (env as { IMAGE_GEN_PROVIDER?: string }).IMAGE_GEN_PROVIDER?.trim();
  if (provider === "runninghub") {
    return runningHubImageGenProvider;
  }
  return mockImageGenProvider;
}
