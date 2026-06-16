import { describe, expect, it } from "vitest";

import { applyRelationshipSignalBoost } from "./relationship-boost";

describe("applyRelationshipSignalBoost", () => {
  it("leaves signals unchanged when no boost condition applies", () => {
    const result = applyRelationshipSignalBoost({
      preferredSceneIds: ["pier_cafe"],
      sceneId: "library",
      signals: { closeness: 1, trust: -1 },
      storyProgressEligible: false,
    });

    expect(result.multiplier).toBe(1);
    expect(result.reasons).toEqual([]);
    expect(result.signals).toEqual({ closeness: 1, trust: -1 });
  });

  it("boosts positive and negative signals in a favorite scene", () => {
    const result = applyRelationshipSignalBoost({
      preferredSceneIds: ["pier_cafe"],
      sceneId: "pier_cafe",
      signals: { closeness: 1, hostility: 1, trust: -1 },
      storyProgressEligible: false,
    });

    expect(result.multiplier).toBe(1.5);
    expect(result.reasons).toEqual(["favorite_scene"]);
    expect(result.signals).toEqual({ closeness: 2, hostility: 2, trust: -2 });
  });

  it("boosts story progress without stacking with favorite scene", () => {
    const result = applyRelationshipSignalBoost({
      preferredSceneIds: ["pier_cafe"],
      sceneId: "pier_cafe",
      signals: { closeness: 1, romance: 2 },
      storyProgressEligible: true,
    });

    expect(result.multiplier).toBe(1.5);
    expect(result.reasons).toEqual(["favorite_scene", "story_progress"]);
    expect(result.signals).toEqual({ closeness: 2, romance: 3 });
  });

  it("keeps boosted signals within the existing per-turn clamp", () => {
    const result = applyRelationshipSignalBoost({
      preferredSceneIds: [],
      sceneId: "pier_cafe",
      signals: { closeness: 4, distance: -4 },
      storyProgressEligible: true,
    });

    expect(result.signals).toEqual({ closeness: 5, distance: -5 });
  });
});
