import { describe, expect, it } from "vitest";

import { nextStepKey, renderScenePrompt } from "./scene-engine";
import type { CharacterCard, SceneStep } from "./types";

describe("scene engine", () => {
  it("renders prompts from character cards without owning character state", () => {
    const character: CharacterCard = {
      assets: {},
      characterKey: "noah",
      dimensions: { trust: 10 },
      displayName: "Noah",
      id: "character-noah-v1",
      identity: { name: "Noah" },
      persona: {},
      publicProfile: {},
      style: {},
      version: 1,
    };

    expect(renderScenePrompt(step("opening", 10, false), character)).toContain("Noah");
    expect(character.dimensions).toEqual({ trust: 10 });
  });

  it("advances through scene steps and stops on terminal steps", () => {
    const steps = [
      step("opening", 10, false),
      step("middle", 20, false),
      step("close", 30, true),
    ];

    expect(nextStepKey(steps, "opening")).toBe("middle");
    expect(nextStepKey(steps, "middle")).toBe("close");
    expect(nextStepKey(steps, "close")).toBeNull();
  });
});

function step(stepKey: string, stepOrder: number, isTerminal: boolean): SceneStep {
  return {
    isTerminal,
    options: [],
    promptTemplate: "{{characterName}} asks one careful question.",
    sceneKey: "test-scene",
    stepKey,
    stepOrder,
  };
}
