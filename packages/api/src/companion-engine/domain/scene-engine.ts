import type { CharacterCard, SceneStep } from "./types";

export function renderScenePrompt(step: SceneStep, character: CharacterCard): string {
  const identityName = typeof character.identity.name === "string" ? character.identity.name : character.displayName;
  return step.promptTemplate
    .replaceAll("{{characterName}}", identityName)
    .replaceAll("{{characterKey}}", character.characterKey);
}

export function nextStepKey(steps: SceneStep[], currentStepKey: string): string | null {
  const ordered = [...steps].sort((left, right) => left.stepOrder - right.stepOrder);
  const index = ordered.findIndex((step) => step.stepKey === currentStepKey);
  if (index < 0 || ordered[index]?.isTerminal) {
    return null;
  }

  return ordered[index + 1]?.stepKey ?? null;
}
