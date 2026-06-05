import { resolveImageGenConfig } from "../settings/store";
import { mockImageGenProvider } from "./mock-provider";
import { openAiImageGenProvider } from "./openai-provider";
import { runningHubImageGenProvider } from "./runninghub-provider";
import type { ImageGenMode, ImageGenProvider } from "./types";
import {
  CHAT_MOMENT_WORKFLOW_KEY,
  COMPANION_CUTOUT_WORKFLOW_KEY,
  PROFILE_OUTFIT_WORKFLOW_KEY,
  PORTRAIT_CREATE_WORKFLOW_KEY,
  PORTRAIT_VARIATION_WORKFLOW_KEY,
  SCENE_BACKGROUND_WORKFLOW_KEY,
  normalizeWorkflowKey,
} from "./workflow-keys";

export {
  type CompanionPromptContext,
  type CompletedImageGenResponse,
  type ImageGenMode,
  type ImageGenProvider,
  type ImageGenRequest,
  type ImageGenResponse,
  type NonNeutralEmotion,
  type PendingImageGenResponse,
  ImageGenError,
  NON_NEUTRAL_EMOTIONS,
} from "./types";
export {
  type WorkflowConfig,
  getWorkflowConfig,
  isImageGenMode,
  parseWorkflows,
  workflowHasCheckpointNode,
} from "./workflows";
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
  type ImageModelOption,
  type ImageLora,
  type ImageLoraInput,
  type ImageLoraRow,
  type ImageLoraSelection,
  type ImageModel,
  type ImageModelInput,
  type ImageModelRow,
  type ImageModelSelection,
  type ImageWorkflow,
  type ImageWorkflowInput,
  type ImageWorkflowRow,
  type ImageWorkflowWithModels,
  createImageLora,
  createImageModel,
  deleteImageWorkflow,
  deleteImageLora,
  deleteImageModel,
  getImageLora,
  getImageModel,
  getImageModelSelection,
  getImageWorkflow,
  listActiveImageModels,
  listActiveImageModelOptions,
  listImageLoraRows,
  listImageModelRows,
  listImageWorkflowRows,
  normalizeArchitecture,
  resolveImageLoraSelection,
  updateImageLora,
  updateImageModel,
  upsertImageWorkflow,
} from "./models";

/**
 * Return the active image-gen provider for a given workflow mode.
 *
 * Semantic workflows can each run on a different engine independently. The
 * per-workflow/per-mode setting
 * wins; an empty value falls back to the default `image_gen.provider`, then to
 * mock for local/CI.
 */
export async function getImageGenProvider(
  env: Env,
  mode: ImageGenMode,
  workflowKey?: string | null,
): Promise<ImageGenProvider> {
  const cfg = await resolveImageGenConfig(env);
  const key = normalizeWorkflowKey(workflowKey);
  const perMode =
    key === CHAT_MOMENT_WORKFLOW_KEY
      ? cfg.chatMomentProvider
      : key === SCENE_BACKGROUND_WORKFLOW_KEY
        ? cfg.sceneBackgroundProvider
        : key === COMPANION_CUTOUT_WORKFLOW_KEY
          ? cfg.companionCutoutProvider
          : key === PROFILE_OUTFIT_WORKFLOW_KEY
            ? cfg.profileOutfitProvider
            : key === PORTRAIT_CREATE_WORKFLOW_KEY || mode === "create"
              ? cfg.portraitCreateProvider
              : key === PORTRAIT_VARIATION_WORKFLOW_KEY
                ? cfg.portraitVariationProvider
              : mode === "cutout"
                ? cfg.companionCutoutProvider
                : cfg.portraitVariationProvider;
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
