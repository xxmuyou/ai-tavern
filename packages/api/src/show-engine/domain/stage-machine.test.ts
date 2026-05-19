import { describe, expect, it } from "vitest";

import { DATING_SHOW_FLOW, buildTurnDraft, composeTurnAnswer } from "./stage-machine";
import type { StageGuest, StageSession } from "./types";

const guests: StageGuest[] = [
  {
    affinityScore: 80,
    characterKey: "ivy",
    isAvailable: true,
    lightState: "on",
    name: "Ivy",
  },
  {
    affinityScore: 70,
    characterKey: "mia",
    isAvailable: true,
    lightState: "on",
    name: "Mia",
  },
];

const session: StageSession = {
  initialPickCharacterKey: "mia",
  messageCount: 0,
  userProfile: JSON.stringify({
    ageRange: "25-30",
    hobbies: ["music", "travel"],
    occupation: "designer",
  }),
};

describe("dating stage machine", () => {
  it("declares the fixed show flow as data", () => {
    expect(DATING_SHOW_FLOW.stages.map((stage) => stage.stageKey)).toEqual([
      "initial_pick",
      "self_intro",
      "guest_questions",
      "user_questions",
      "final_choice",
    ]);
  });

  it("builds initial pick and self intro turns", () => {
    expect(buildTurnDraft({ guests, session, stageKey: "initial_pick" })?.options).toHaveLength(3);
    expect(buildTurnDraft({ guests, session, stageKey: "self_intro" })?.question).toContain("your age range");
  });

  it("lets the initially picked guest ask the first guest question", () => {
    const draft = buildTurnDraft({ guests, session, stageKey: "guest_questions" });

    expect(draft?.speakerName).toBe("Mia");
  });

  it("composes option preview, picked guest, and free text into one answer", () => {
    const answer = composeTurnAnswer({
      freeText: "I noticed her confidence.",
      pickedGuestName: "Ivy",
      selectedOption: {
        id: "specific_spark",
        label: "Specific spark",
        preview: "I noticed a concrete detail, not just the surface.",
        signalText: "honesty",
      },
      stageKey: "initial_pick",
    });

    expect(answer).toContain("I choose Ivy.");
    expect(answer).toContain("concrete detail");
    expect(answer).toContain("confidence");
  });
});
