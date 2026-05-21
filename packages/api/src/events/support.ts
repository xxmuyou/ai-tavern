import type { CompanionForPrompt, SceneForPrompt } from "./types";

export async function loadCompanionForEvent(env: Env, companionId: string): Promise<CompanionForPrompt | null> {
  return env.DB.prepare(
    `SELECT id, name, personality, speech_style
     FROM companions
     WHERE id = ? AND is_active = 1`,
  )
    .bind(companionId)
    .first<CompanionForPrompt>();
}

export async function loadSceneForEvent(env: Env, sceneId: string | null): Promise<SceneForPrompt | null> {
  if (!sceneId) return null;
  return env.DB.prepare(
    `SELECT id, name, mood
     FROM scenes
     WHERE id = ? AND is_active = 1`,
  )
    .bind(sceneId)
    .first<SceneForPrompt>();
}
