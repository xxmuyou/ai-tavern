import { describe, expect, it } from "vitest";

import { buildGuestPromptContext } from "./guest-prompt-context";

describe("guest prompt context", () => {
  it("includes structured identity, persona, preferences, user, and stage context", () => {
    const context = buildGuestPromptContext({
      currentAffinity: 62,
      guestName: "Ivy",
      snapshot: {
        ageRange: "28-34",
        boundaries: "Avoid empty promises.",
        cityOrLifestyle: "Shanghai founder circle",
        dealbreakerSignals: ["bragging"],
        hardPreferenceSignals: ["stable_professional"],
        hiddenPreferences: "stable career direction, refined taste",
        hobbies: ["wine", "design"],
        occupationTag: "startup product lead",
        personality: "sharp, composed, status-aware",
        positiveSignals: ["ambition"],
        relationshipToUser: "A dating guest evaluating the contestant.",
        speakingStyle: "precise, lightly challenging",
      },
      stageKey: "guest_questions",
      userBackground: "30s product manager who likes music",
      userInput: "I care about calm ambition.",
    });

    expect(context).toContain("Guest: Ivy");
    expect(context).toContain("28-34");
    expect(context).toContain("startup product lead");
    expect(context).toContain("sharp, composed");
    expect(context).toContain("stable career direction");
    expect(context).toContain("Current affinity: 62");
    expect(context).toContain("Contestant latest input: I care about calm ambition.");
  });
});
