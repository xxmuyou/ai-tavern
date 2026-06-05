export const PORTRAIT_CREATE_WORKFLOW_KEY = "portrait_create";
export const PORTRAIT_CREATE_LORA_WORKFLOW_KEY = "portrait_create_lora";
export const PORTRAIT_VARIATION_WORKFLOW_KEY = "portrait_variation";
export const CHAT_MOMENT_WORKFLOW_KEY = "chat_moment";
export const COMPANION_CUTOUT_WORKFLOW_KEY = "companion_cutout";
export const PROFILE_OUTFIT_WORKFLOW_KEY = "profile_outfit";
export const SCENE_BACKGROUND_WORKFLOW_KEY = "scene_background";

const LEGACY_WORKFLOW_KEY_MAP: Record<string, string> = {
  wf1: PORTRAIT_CREATE_WORKFLOW_KEY,
  wf2: PORTRAIT_VARIATION_WORKFLOW_KEY,
  wf_moment: CHAT_MOMENT_WORKFLOW_KEY,
  wf_cutout: COMPANION_CUTOUT_WORKFLOW_KEY,
  wf_outfit: PROFILE_OUTFIT_WORKFLOW_KEY,
  wf_scene: SCENE_BACKGROUND_WORKFLOW_KEY,
};

export function normalizeWorkflowKey(key: string | null | undefined): string {
  const trimmed = key?.trim();
  if (!trimmed) return "";
  return LEGACY_WORKFLOW_KEY_MAP[trimmed] ?? trimmed;
}
