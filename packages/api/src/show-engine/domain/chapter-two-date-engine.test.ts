import { describe, expect, it } from "vitest";

import {
  canStartChapterTwoDate,
  chapterTwoDateLocation,
  chapterTwoDateSteps,
  listChapterTwoDateLocations,
  nextChapterTwoDateStepKey,
  renderChapterTwoDatePrompt,
} from "./chapter-two-date-engine";

describe("chapter two date engine", () => {
  it("defines the three preset date locations", () => {
    expect(listChapterTwoDateLocations().map((location) => location.locationKey)).toEqual(["cafe", "cinema", "bar"]);
    expect(chapterTwoDateLocation("cafe")?.assetKey).toContain("cafe-date.png");
  });

  it("creates stable three-turn date flows for every location", () => {
    for (const location of listChapterTwoDateLocations()) {
      const steps = chapterTwoDateSteps(location.locationKey);
      expect(steps).toHaveLength(3);
      expect(steps.at(-1)?.isTerminal).toBe(true);
      expect(renderChapterTwoDatePrompt(steps[0]!, "Ivy")).toContain("Ivy");
      expect(steps[0]?.options).toHaveLength(3);
    }
  });

  it("advances through date steps and completes on terminal turns", () => {
    const steps = chapterTwoDateSteps("bar");

    expect(nextChapterTwoDateStepKey(steps, "arrival")).toBe("shared-moment");
    expect(nextChapterTwoDateStepKey(steps, "shared-moment")).toBe("closing-signal");
    expect(nextChapterTwoDateStepKey(steps, "closing-signal")).toBeNull();
  });

  it("only allows unlocked companions from the same show to start chapter two", () => {
    const unlockedCompanions = [
      { id: "companion-1", showKey: "dating-heart-signal", unlockStatus: "unlocked" },
      { id: "companion-2", showKey: "dating-heart-signal", unlockStatus: "locked" },
      { id: "companion-3", showKey: "other-show", unlockStatus: "unlocked" },
    ];

    expect(canStartChapterTwoDate({ companionId: "companion-1", showKey: "dating-heart-signal", unlockedCompanions })).toBe(true);
    expect(canStartChapterTwoDate({ companionId: "companion-2", showKey: "dating-heart-signal", unlockedCompanions })).toBe(false);
    expect(canStartChapterTwoDate({ companionId: "companion-3", showKey: "dating-heart-signal", unlockedCompanions })).toBe(false);
    expect(canStartChapterTwoDate({ companionId: "missing", showKey: "dating-heart-signal", unlockedCompanions })).toBe(false);
  });
});
