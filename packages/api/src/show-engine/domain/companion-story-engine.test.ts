import { describe, expect, it } from "vitest";

import {
  canEnterChapterThree,
  canEnterChapterTwo,
  companionResponseLine,
  companionStoryDefinition,
  normalizeRelationshipState,
  readCompanionStoryOptions,
  shouldRequirePlatformPass,
} from "./companion-story-engine";

describe("companion story engine", () => {
  it("creates reusable date scenes for an unlocked companion", () => {
    const story = companionStoryDefinition("Ivy");

    expect(story.scenes).toHaveLength(3);
    expect(story.scenes[0]?.prompt).toContain("Ivy");
    expect(story.scenes[0]?.options).toHaveLength(3);
  });

  it("requires Platform Pass after free story turns", () => {
    expect(shouldRequirePlatformPass({ activeEntitlement: false, freeTurnLimit: 2, storyTurnCount: 2 })).toBe(true);
    expect(shouldRequirePlatformPass({ activeEntitlement: false, freeTurnLimit: 2, storyTurnCount: 1 })).toBe(false);
    expect(shouldRequirePlatformPass({ activeEntitlement: true, freeTurnLimit: 2, storyTurnCount: 8 })).toBe(false);
    expect(shouldRequirePlatformPass({ activeEntitlement: false, freeTurnLimit: 2, isAdmin: true, storyTurnCount: 8 })).toBe(false);
  });

  it("normalizes and gates companion relationship states by chapter", () => {
    expect(normalizeRelationshipState("unlocked")).toBe("regular_friend");
    expect(canEnterChapterTwo({ relationshipState: "regular_friend" })).toBe(false);
    expect(canEnterChapterTwo({ relationshipState: "date_object" })).toBe(true);
    expect(canEnterChapterTwo({ relationshipState: "love_object" })).toBe(true);
    expect(canEnterChapterTwo({ isAdmin: true, relationshipState: "regular_friend" })).toBe(true);
    expect(canEnterChapterThree({ relationshipState: "date_object" })).toBe(false);
    expect(canEnterChapterThree({ relationshipState: "love_object" })).toBe(true);
  });

  it("serializes story options and response lines without storage dependencies", () => {
    const options = readCompanionStoryOptions(JSON.stringify([{ id: "bold", label: "Bold", preview: "Clear want." }]));
    const line = companionResponseLine({
      companionName: "Ivy",
      freeText: "",
      selectedOption: options[0] ?? null,
    });

    expect(options[0]?.id).toBe("bold");
    expect(line).toContain("Ivy");
  });
});
