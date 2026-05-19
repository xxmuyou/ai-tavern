import { readJsonObject, readStringList } from "./json";
import type { ShowFlowDefinition, StageGuest, StageSession, TurnDraft, TurnOption } from "./types";

export const DATING_SHOW_FLOW: ShowFlowDefinition = {
  initialStageKey: "initial_pick",
  showKey: "dating-heart-signal",
  stages: [
    {
      allowedActions: ["answer"],
      nextStageRuleKey: "first_impression_to_profile",
      resolverKey: "initial_pick",
      stageKey: "initial_pick",
      turnBuilderKey: "first_impression",
    },
    {
      allowedActions: ["answer"],
      nextStageRuleKey: "profile_to_guest_questions",
      resolverKey: "profile_judgment",
      stageKey: "profile_judgment",
      turnBuilderKey: "profile_identity",
    },
    {
      allowedActions: ["answer"],
      nextStageRuleKey: "question_rounds_before_declaration",
      resolverKey: "guest_questions",
      stageKey: "guest_questions",
      turnBuilderKey: "guest_question",
    },
    {
      allowedActions: ["answer"],
      nextStageRuleKey: "declaration_to_final_choice",
      resolverKey: "user_declaration",
      stageKey: "user_declaration",
      turnBuilderKey: "user_declaration",
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

  if (input.stageKey === "profile_judgment") {
    const identitySummary = sessionIdentitySummary(input.session.userProfile);
    return {
      options: profileOptions(),
      question: `Identity board: ${identitySummary}. Which part should the guests test first before they decide whether the signal feels real?`,
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
      options: answerStyleOptions(),
      question: questionForGuest(guest, input.session.messageCount),
      speakerKey: guest.characterKey,
      speakerName: guest.name,
      stageKey: input.stageKey,
    };
  }

  if (input.stageKey === "user_declaration") {
    return {
      options: declarationOptions(),
      question:
        "Final declaration: tell the room what you want, what you will protect, and what you cannot accept.",
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

export function profileOptions(): TurnOption[] {
  return [
    {
      id: "work_rhythm",
      label: "Work rhythm",
      preview: "I explain what my work says about how I spend energy with people.",
      signalText: "responsibility ambition communicate maturity",
    },
    {
      id: "hobby_story",
      label: "Hobby spark",
      preview: "I share one hobby story that shows how I relax, play, or stay curious.",
      signalText: "creativity shared_fun humor warmth",
    },
    {
      id: "direct_basics",
      label: "Direct basics",
      preview: "I keep the intro simple and let the room ask sharper follow-ups.",
      signalText: "honesty sincere stability maturity",
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

export function declarationOptions(): TurnOption[] {
  return [
    {
      id: "mutual_growth",
      label: "Mutual growth",
      preview: "I want a relationship where both people become more honest and alive.",
      signalText: "honesty maturity warmth responsibility",
    },
    {
      id: "daily_romance",
      label: "Daily romance",
      preview: "I care about the small daily proof: kindness, humor, and showing up.",
      signalText: "kindness humor family stability warmth",
    },
    {
      id: "clear_boundaries",
      label: "Clear boundaries",
      preview: "I can be warm, but I will not accept disrespect, control, or dishonesty.",
      signalText: "honesty boundary responsibility communication",
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

export function questionForGuest(guest: StageGuest, round: number): string {
  const key = guest.characterKey;
  const fallbacks = [
    `${guest.name}: What do you do when a first impression goes well, but the real person needs patience?`,
    `${guest.name}: What is one thing you would never fake just to be liked on a stage like this?`,
    `${guest.name}: When someone disappoints you, do you get direct, quiet, funny, or gone?`,
  ];

  const questions: Record<string, string[]> = {
    ivy: [
      "Ivy: I like confidence, but I listen for proof. When pressure hits, what do you actually do?",
      "Ivy: Give me one example of reliability that is not just a slogan.",
      "Ivy: What ambition would you protect, and what would you never sacrifice for it?",
    ],
    leo: [
      "Leo: If we had one free day in a city neither of us knows, how would you lead it?",
      "Leo: What makes you brave in love without becoming reckless?",
      "Leo: Do you believe romance needs a plan, a surprise, or both?",
    ],
    mia: [
      "Mia: I can spot a performance pretty fast. What is something real you would say without polishing it?",
      "Mia: How do you flirt when you actually respect the person in front of you?",
      "Mia: What kind of joke would make you relax on a first date?",
    ],
    noah: [
      "Noah: I trust small actions. What daily habit would make someone feel safe with you?",
      "Noah: When life gets ordinary, how do you keep care from becoming automatic?",
      "Noah: What is your version of practical romance?",
    ],
  };

  const list = questions[key] ?? fallbacks;
  return list[round % list.length] ?? fallbacks[0] ?? `${guest.name}: What do you want the room to know first?`;
}

function normalizeShortText(value: string | undefined, fallback: string, maxLength: number): string {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return fallback;
  }

  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}
