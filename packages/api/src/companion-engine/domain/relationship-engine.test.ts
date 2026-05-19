import { describe, expect, it } from "vitest";

import { computeRelationshipUpdate } from "./relationship-engine";
import type { CharacterCard, DimensionDefinition } from "./types";

const definitions = new Map<string, DimensionDefinition>([
  ["affection", numberDefinition("affection")],
  ["trust", numberDefinition("trust")],
  ["intimacy", numberDefinition("intimacy")],
  ["dependency", numberDefinition("dependency")],
  ["tension", numberDefinition("tension")],
  ["curiosity", numberDefinition("curiosity")],
  ["caution", numberDefinition("caution")],
  ["devotion", numberDefinition("devotion")],
]);

const character: CharacterCard = {
  assets: {},
  characterKey: "mia",
  dimensions: {
    boundaries: ["contempt", "aggression"],
    preferences: ["honesty", "humor"],
  },
  displayName: "Mia",
  id: "character-mia-v1",
  identity: { name: "Mia" },
  persona: {},
  publicProfile: {},
  style: {},
  version: 1,
};

describe("relationship engine", () => {
  it("applies scene option effects to arbitrary relationship dimensions", () => {
    const result = computeRelationshipUpdate({
      answerText: "I want to answer with a real detail because it mattered today.",
      character,
      definitions,
      relationship: {
        dimensions: {
          affection: 35,
          devotion: 10,
          trust: 35,
        },
        id: "relationship-1",
      },
      selectedOption: {
        id: "specific",
        label: "Specific",
        preview: "I answer with one specific detail.",
        relationshipEffects: {
          affection: 4,
          devotion: 7,
        },
        signals: ["honesty", "specificity"],
      },
    });

    expect(result.nextDimensions.devotion).toBe(17);
    expect(result.nextDimensions.affection).toBeGreaterThan(35);
    expect(result.nextDimensions.trust).toBeGreaterThan(35);
    expect(result.signals).toContain("honesty");
  });

  it("keeps character card dimensions immutable while relationship changes", () => {
    const before = JSON.stringify(character.dimensions);
    const result = computeRelationshipUpdate({
      answerText: "That sounds worthless and I look down on it.",
      character,
      definitions,
      relationship: {
        dimensions: {
          affection: 50,
          caution: 10,
          tension: 5,
          trust: 50,
        },
        id: "relationship-1",
      },
      selectedOption: null,
    });

    expect(JSON.stringify(character.dimensions)).toBe(before);
    expect(result.nextDimensions.caution).toBeGreaterThan(10);
    expect(result.nextDimensions.trust).toBeLessThan(50);
  });
});

function numberDefinition(dimensionKey: string): DimensionDefinition {
  return {
    appliesTo: "relationship",
    defaultValue: 0,
    dimensionKey,
    label: dimensionKey,
    maxValue: 100,
    minValue: 0,
    valueType: "number",
  };
}
