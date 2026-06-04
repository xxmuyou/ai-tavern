import { resolveImageGenConfig } from "../settings/store";
import { mockImageGenProvider } from "./mock-provider";
import { openAiImageGenProvider } from "./openai-provider";
import { runningHubImageGenProvider } from "./runninghub-provider";
import type { ImageGenMode, ImageGenProvider } from "./types";

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
  type ImageModel,
  type ImageModelInput,
  type ImageModelRow,
  type ImageModelSelection,
  type ImageWorkflow,
  type ImageWorkflowInput,
  type ImageWorkflowRow,
  type ImageWorkflowWithModels,
  createImageModel,
  deleteImageWorkflow,
  deleteImageModel,
  getImageModel,
  getImageModelSelection,
  getImageWorkflow,
  listActiveImageModels,
  listActiveImageModelOptions,
  listImageModelRows,
  listImageWorkflowRows,
  updateImageModel,
  upsertImageWorkflow,
} from "./models";

/**
 * Return the active image-gen provider for a given workflow mode.
 *
 * WF1 (`create`), WF2 (`variation`), WF_MOMENT and WF_SCENE can each run on a
 * different engine so they switch independently (e.g. WF1 on openai while
 * WF_SCENE backgrounds stay on runninghub). The per-workflow/per-mode setting
 * wins; an empty value falls back to the default `image_gen.provider`, then to
 * mock for local/CI.
 */
export async function getImageGenProvider(
  env: Env,
  mode: ImageGenMode,
  workflowKey?: string | null,
): Promise<ImageGenProvider> {
  const cfg = await resolveImageGenConfig(env);
  const perMode =
    workflowKey === "wf_moment"
      ? cfg.wfMomentProvider
      : workflowKey === "wf_scene"
        ? cfg.wfSceneProvider
        : workflowKey === "wf_cutout"
          ? cfg.wfCutoutProvider
          : workflowKey === "wf_outfit"
            ? cfg.wfOutfitProvider
            : mode === "create"
              ? cfg.wf1Provider
              : mode === "cutout"
                ? cfg.wfCutoutProvider
                : cfg.wf2Provider;
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
