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

  it("only allows date-or-love companions from the same show to start chapter two", () => {
    const unlockedCompanions = [
      { id: "companion-1", relationshipState: "date_object", showKey: "dating-heart-signal", unlockStatus: "unlocked" },
      { id: "companion-2", relationshipState: "regular_friend", showKey: "dating-heart-signal", unlockStatus: "unlocked" },
      { id: "companion-3", relationshipState: "love_object", showKey: "other-show", unlockStatus: "unlocked" },
      { id: "companion-4", relationshipState: "date_object", showKey: "dating-heart-signal", unlockStatus: "locked" },
    ];

    expect(canStartChapterTwoDate({ companionId: "companion-1", showKey: "dating-heart-signal", unlockedCompanions })).toBe(true);
    expect(canStartChapterTwoDate({ companionId: "companion-2", showKey: "dating-heart-signal", unlockedCompanions })).toBe(false);
    expect(canStartChapterTwoDate({ companionId: "companion-3", showKey: "dating-heart-signal", unlockedCompanions })).toBe(false);
    expect(canStartChapterTwoDate({ companionId: "companion-4", showKey: "dating-heart-signal", unlockedCompanions })).toBe(false);
    expect(canStartChapterTwoDate({ companionId: "missing", showKey: "dating-heart-signal", unlockedCompanions })).toBe(false);
  });

  it("lets admins start chapter two for any companion row in the show", () => {
    const unlockedCompanions = [
      { id: "companion-1", relationshipState: "regular_friend", showKey: "dating-heart-signal", unlockStatus: "locked" },
    ];

    expect(canStartChapterTwoDate({
      companionId: "companion-1",
      isAdmin: true,
      showKey: "dating-heart-signal",
      unlockedCompanions,
    })).toBe(true);
  });
});
