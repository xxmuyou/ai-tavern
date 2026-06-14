import { describe, expect, it } from "vitest";

import {
  buildOutfitPrompt,
  getOutfitRecommendations,
  validateCustomOutfitPrompt,
  type OutfitPromptContext,
} from "./outfit-image";

function context(overrides: Partial<OutfitPromptContext> = {}): OutfitPromptContext {
  return {
    activity: null,
    companion: {
      appearance: "short black hair, warm eyes, slim build",
      gender: "female",
      name: "Maya",
      personality: "quietly playful",
      relationship_role: "friend",
    },
    scene: {
      mood: "warm cafe light",
      name: "Pier Coffee Shop",
      tags: ["cafe", "harbor"],
    },
    stage: "familiar",
    timeSlot: "morning",
    ...overrides,
  };
}

describe("outfit image prompts", () => {
  it("returns three safe scene-aware recommendations", () => {
    const recommendations = getOutfitRecommendations(context());

    expect(recommendations).toHaveLength(3);
    expect(recommendations[0]?.id).toBe("warm_cafe_layers");
    expect(recommendations.every((item) => item.prompt.includes("outfit"))).toBe(true);
  });

  it("validates custom outfit prompts", () => {
    expect(validateCustomOutfitPrompt("")).toEqual({ error: "prompt_required", ok: false });
    expect(validateCustomOutfitPrompt("x".repeat(241))).toEqual({
      error: "prompt_too_long",
      ok: false,
    });
    expect(validateCustomOutfitPrompt("nsfw naked outfit")).toEqual({
      error: "unsafe_prompt",
      ok: false,
    });
    expect(validateCustomOutfitPrompt("lace lingerie-inspired evening dress")).toEqual({
      ok: true,
      prompt: "lace lingerie-inspired evening dress",
    });
    expect(validateCustomOutfitPrompt("black oversized hoodie")).toEqual({
      ok: true,
      prompt: "black oversized hoodie",
    });
  });

  it("builds a prompt that preserves identity and only changes clothing", () => {
    const prompt = buildOutfitPrompt(context(), "black oversized hoodie");

    expect(prompt).toContain("Only change the clothing, accessories");
    expect(prompt).toContain("Keep the same identity");
    expect(prompt).toContain("Outfit request: black oversized hoodie.");
    expect(prompt).toContain("No text, no UI");
    expect(prompt).toContain("no nudity");
  });
});
