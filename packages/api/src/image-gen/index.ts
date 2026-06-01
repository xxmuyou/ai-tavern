import { resolveImageGenConfig } from "../settings/store";
import { mockImageGenProvider } from "./mock-provider";
import { openAiImageGenProvider } from "./openai-provider";
import { runningHubImageGenProvider } from "./runninghub-provider";
import type { ImageGenMode, ImageGenProvider } from "./types";

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
 * Return the active image-gen provider for a given workflow mode.
 *
 * WF1 (`create`) and WF2 (`variation`) can run on different engines so they can
 * be switched independently (e.g. WF1 on openai while WF2 stays on runninghub).
 * The per-mode setting wins; an empty per-mode value falls back to the default
 * `image_gen.provider`, then to mock for local/CI.
 */
export async function getImageGenProvider(
  env: Env,
  mode: ImageGenMode,
): Promise<ImageGenProvider> {
  const cfg = await resolveImageGenConfig(env);
  const perMode = mode === "create" ? cfg.wf1Provider : cfg.wf2Provider;
  const provider = (perMode?.trim() || cfg.provider || "mock").toLowerCase();
  switch (provider) {
    case "runninghub":
      return runningHubImageGenProvider;
    case "openai":
      return openAiImageGenProvider;
    default:
      return mockImageGenProvider;
  }
}
