import { readJsonObject, readStringList } from "./json";
import type { ShowFlowDefinition, StageGuest, StageSession, TurnDraft, TurnOption } from "./types";

export const DATING_SHOW_FLOW: ShowFlowDefinition = {
  initialStageKey: "initial_pick",
  showKey: "dating-heart-signal",
  stages: [
    {
      allowedActions: ["answer"],
      nextStageRuleKey: "initial_pick_to_self_intro",
      resolverKey: "initial_pick",
      stageKey: "initial_pick",
      turnBuilderKey: "first_impression",
    },
    {
      allowedActions: ["answer"],
      nextStageRuleKey: "self_intro_to_guest_questions",
      resolverKey: "self_intro",
      stageKey: "self_intro",
      turnBuilderKey: "self_intro",
    },
    {
      allowedActions: ["answer"],
      nextStageRuleKey: "guest_questions_or_move_on",
      resolverKey: "guest_questions",
      stageKey: "guest_questions",
      turnBuilderKey: "guest_question",
    },
    {
      allowedActions: ["answer"],
      nextStageRuleKey: "user_questions_or_final",
      resolverKey: "user_questions",
      stageKey: "user_questions",
      turnBuilderKey: "user_questions",
    },
    {
      allowedActions: ["final_choice"],
      nextStageRuleKey: "complete_or_unlock_companion",
      resolverKey: "final_choice",
      stageKey: "final_choice",
      turnBuilderKey: "none",
    },
  ],
};

export function buildTurnDraft(input: {
  guests: StageGuest[];
  host?: StageGuest;
  session: StageSession;
  stageKey: string;
}): TurnDraft | null {
  const hostName = input.host?.name ?? "Host";
  const hostKey = input.host?.characterKey ?? "host";
  const availableGuests = input.guests.filter((guest) => guest.lightState !== "off" && guest.isAvailable);

  if (input.stageKey === "initial_pick") {
    return {
      options: firstImpressionOptions(),
      question:
        "First heartbeat: choose one guest who catches your attention, then give the room a specific reason.",
      speakerKey: hostKey,
      speakerName: hostName,
      stageKey: input.stageKey,
    };
  }

  if (input.stageKey === "self_intro") {
    return {
      options: [],
      question:
        "Before the guests start asking, tell the room a little about yourself: your age range, what you do, and what makes your off-hours worth living. The more real, the better the questions.",
      speakerKey: hostKey,
      speakerName: hostName,
      stageKey: input.stageKey,
    };
  }

  if (input.stageKey === "guest_questions") {
    const guest = chooseQuestioningGuest(availableGuests, input.session) ?? availableGuests[0];
    if (!guest) {
      return null;
    }

    return {
      options: answerStyleWithMoveOnOptions(),
      // Placeholder: createTurnForStage replaces this with an LLM-generated question.
      question: `${guest.name}: What do you want the room to know first?`,
      speakerKey: guest.characterKey,
      speakerName: guest.name,
      stageKey: input.stageKey,
    };
  }

  if (input.stageKey === "user_questions") {
    return {
      options: moveToFinalOptions(),
      question:
        "The floor is yours. Pick any guest and ask them anything. This is your chance before the final call.",
      speakerKey: hostKey,
      speakerName: hostName,
      stageKey: input.stageKey,
    };
  }

  return null;
}

export function composeTurnAnswer(input: {
  freeText: string;
  pickedGuestName?: string;
  selectedOption: TurnOption | null;
  stageKey: string;
}): string {
  const parts: string[] = [];
  if (input.stageKey === "initial_pick" && input.pickedGuestName) {
    parts.push(`I choose ${input.pickedGuestName}.`);
  }

  if (input.selectedOption?.preview) {
    parts.push(input.selectedOption.preview);
  }

  if (input.freeText) {
    parts.push(input.freeText);
  }

  return normalizeShortText(parts.join(" "), "", 1200);
}

export function firstImpressionOptions(): TurnOption[] {
  return [
    {
      id: "specific_spark",
      label: "Specific spark",
      preview: "I noticed a concrete detail, not just the surface.",
      signalText: "honesty curiosity warmth sincere",
    },
    {
      id: "playful_energy",
      label: "Playful energy",
      preview: "I want to start with chemistry and a little brave energy.",
      signalText: "humor adventure creativity courage",
    },
    {
      id: "calm_pull",
      label: "Calm pull",
      preview: "I am drawn to steadiness and how someone carries themselves.",
      signalText: "stability maturity responsibility warmth",
    },
  ];
}

export function answerStyleOptions(): TurnOption[] {
  return [
    {
      id: "honest_detail",
      label: "Honest detail",
      preview: "I answer with a real example instead of a perfect line.",
      signalText: "honesty sincere communicate maturity",
    },
    {
      id: "bold_charm",
      label: "Bold charm",
      preview: "I keep it playful and confident without dodging the question.",
      signalText: "humor courage adventure creativity",
    },
    {
      id: "reflective_boundary",
      label: "Reflective boundary",
      preview: "I say what I can offer and where my boundaries are.",
      signalText: "responsibility stability honesty boundary communicate",
    },
  ];
}

export function answerStyleWithMoveOnOptions(): TurnOption[] {
  return [
    ...answerStyleOptions(),
    {
      id: "move_on",
      label: "Ask my questions ->",
      preview: "I am ready to ask the guests my own questions now.",
      signalText: "",
    },
  ];
}

export function moveToFinalOptions(): TurnOption[] {
  return [
    {
      id: "move_to_final",
      label: "Make my choice ->",
      preview: "I have heard enough. I am ready to choose.",
      signalText: "",
    },
  ];
}

export function sessionIdentitySummary(userProfile: string): string {
  const profile = readJsonObject(userProfile);
  const ageRange = typeof profile.ageRange === "string" ? profile.ageRange : "";
  const occupation = typeof profile.occupation === "string" ? profile.occupation : "";
  const hobbies = readStringList(profile.hobbies);
  const hobbyText = hobbies.length ? `hobbies ${hobbies.join(" / ")}` : "hobbies pending";

  return [ageRange || "age range pending", occupation || "occupation pending", hobbyText].join(", ");
}

export function chooseQuestioningGuest(
  guests: StageGuest[],
  session: StageSession,
): StageGuest | undefined {
  const picked = guests.find((guest) => guest.characterKey === session.initialPickCharacterKey);
  if (picked && session.messageCount === 0) {
    return picked;
  }

  const sorted = [...guests].sort((left, right) => right.affinityScore - left.affinityScore);
  return sorted[session.messageCount % Math.max(sorted.length, 1)];
}

function normalizeShortText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().slice(0, maxLength);
}
