import { getSetting } from "../settings/store";
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
export {
  type ExpressionGender,
  type ExpressionPromptRow,
  EXPRESSION_GENDERS,
  getExpressionPrompt,
  isExpressionGender,
  listExpressionPrompts,
  toExpressionGender,
  upsertExpressionPrompt,
} from "./expression-prompts";
export {
  type ImageModel,
  type ImageModelInput,
  type ImageModelRow,
  createImageModel,
  deleteImageModel,
  getImageModel,
  listActiveImageModels,
  listImageModelRows,
  styleHasCheckpointNode,
  updateImageModel,
} from "./models";

/**
 * Return the active image-gen provider for the current environment.
 *
 * Defaults to mock for local/CI unless explicitly configured otherwise.
 */
export async function getImageGenProvider(env: Env): Promise<ImageGenProvider> {
  const provider = await getSetting(env, "image_gen.provider");
  if (provider === "runninghub") {
    return runningHubImageGenProvider;
  }
  return mockImageGenProvider;
}
