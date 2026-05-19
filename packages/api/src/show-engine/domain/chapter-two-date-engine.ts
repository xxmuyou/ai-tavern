export type ChapterTwoDateLocationKey = "bar" | "cafe" | "cinema";

export type ChapterTwoDateOption = {
  id: string;
  label: string;
  preview: string;
  tone: string;
};

export type ChapterTwoDateStep = {
  isTerminal: boolean;
  options: ChapterTwoDateOption[];
  promptTemplate: string;
  stepKey: string;
  stepOrder: number;
};

export type ChapterTwoDateLocation = {
  assetKey: string;
  locationKey: ChapterTwoDateLocationKey;
  summary: string;
  title: string;
};

export const CHAPTER_TWO_DATE_LOCATIONS: ChapterTwoDateLocation[] = [
  {
    assetKey: "apps/ai-companion/chapter-two/cafe-date.png",
    locationKey: "cafe",
    summary: "A quiet table, warm cups, and a conversation that notices small daily details.",
    title: "Cafe",
  },
  {
    assetKey: "apps/ai-companion/chapter-two/cinema-date.png",
    locationKey: "cinema",
    summary: "Shared attention in the dark, playful reactions, and an honest walk after the credits.",
    title: "Cinema",
  },
  {
    assetKey: "apps/ai-companion/chapter-two/bar-date.png",
    locationKey: "bar",
    summary: "Low light, direct chemistry, clear boundaries, and one brave next-date signal.",
    title: "Bar",
  },
];

const DATE_STEPS: Record<ChapterTwoDateLocationKey, ChapterTwoDateStep[]> = {
  cafe: [
    {
      isTerminal: false,
      options: dateOptions("specific", "soft", "playful"),
      promptTemplate: "{{companionName}} settles across from you with both hands around a warm cup. What do you let the quiet make easier to say?",
      stepKey: "arrival",
      stepOrder: 10,
    },
    {
      isTerminal: false,
      options: dateOptions("daily", "curious", "memory"),
      promptTemplate: "The cafe noise drops into the background. {{companionName}} asks what an ordinary good day with you would actually look like.",
      stepKey: "shared-moment",
      stepOrder: 20,
    },
    {
      isTerminal: true,
      options: dateOptions("ritual", "slow", "next"),
      promptTemplate: "{{companionName}} smiles at the last sip and waits to hear what small ritual you would want to repeat together.",
      stepKey: "closing-signal",
      stepOrder: 30,
    },
  ],
  cinema: [
    {
      isTerminal: false,
      options: dateOptions("tease", "attention", "honest"),
      promptTemplate: "The previews glow across your seats. {{companionName}} leans close and asks what kind of story always catches you off guard.",
      stepKey: "arrival",
      stepOrder: 10,
    },
    {
      isTerminal: false,
      options: dateOptions("shared-laugh", "protective", "surprise"),
      promptTemplate: "Halfway through the movie, your reactions line up at the same scene. {{companionName}} whispers a question only you can answer.",
      stepKey: "shared-moment",
      stepOrder: 20,
    },
    {
      isTerminal: true,
      options: dateOptions("after-credits", "truth", "next"),
      promptTemplate: "Outside after the credits, {{companionName}} asks what the movie made you want to say before the night becomes normal again.",
      stepKey: "closing-signal",
      stepOrder: 30,
    },
  ],
  bar: [
    {
      isTerminal: false,
      options: dateOptions("direct", "boundary", "spark"),
      promptTemplate: "Music hums under the low light. {{companionName}} watches your face and asks what kind of chemistry still feels respectful to you.",
      stepKey: "arrival",
      stepOrder: 10,
    },
    {
      isTerminal: false,
      options: dateOptions("bold", "steady", "vulnerable"),
      promptTemplate: "The conversation sharpens without getting loud. {{companionName}} asks where confidence ends and pressure begins for you.",
      stepKey: "shared-moment",
      stepOrder: 20,
    },
    {
      isTerminal: true,
      options: dateOptions("clear-invite", "slow", "boundary"),
      promptTemplate: "{{companionName}} pauses near the door and asks what kind of ending would make you want a second date.",
      stepKey: "closing-signal",
      stepOrder: 30,
    },
  ],
};

export function listChapterTwoDateLocations(): ChapterTwoDateLocation[] {
  return CHAPTER_TWO_DATE_LOCATIONS;
}

export function chapterTwoDateLocation(locationKey: string): ChapterTwoDateLocation | null {
  return CHAPTER_TWO_DATE_LOCATIONS.find((location) => location.locationKey === locationKey) ?? null;
}

export function chapterTwoDateSteps(locationKey: string): ChapterTwoDateStep[] {
  if (!isChapterTwoDateLocationKey(locationKey)) {
    return [];
  }

  return DATE_STEPS[locationKey];
}

export function renderChapterTwoDatePrompt(step: ChapterTwoDateStep, companionName: string): string {
  return step.promptTemplate.replaceAll("{{companionName}}", companionName);
}

export function nextChapterTwoDateStepKey(steps: ChapterTwoDateStep[], currentStepKey: string): string | null {
  const ordered = [...steps].sort((left, right) => left.stepOrder - right.stepOrder);
  const index = ordered.findIndex((step) => step.stepKey === currentStepKey);
  if (index < 0 || ordered[index]?.isTerminal) {
    return null;
  }

  return ordered[index + 1]?.stepKey ?? null;
}

export function canStartChapterTwoDate(input: {
  companionId: string;
  showKey: string;
  unlockedCompanions: Array<{ id: string; showKey: string; unlockStatus: string }>;
}): boolean {
  return input.unlockedCompanions.some((companion) =>
    companion.id === input.companionId &&
    companion.showKey === input.showKey &&
    companion.unlockStatus === "unlocked"
  );
}

export function chapterTwoDateResponseLine(input: {
  companionName: string;
  freeText: string;
  locationKey: string;
  selectedOption: ChapterTwoDateOption | null;
}): string {
  const tone = input.selectedOption?.tone ?? "";
  if (tone.includes("boundary")) {
    return `${input.companionName} nods, visibly more at ease. "That makes the moment feel safer, not smaller."`;
  }

  if (tone.includes("playful") || tone.includes("spark") || tone.includes("bold")) {
    return `${input.companionName} smiles like the date just found its rhythm. "Careful. I might remember that line."`;
  }

  if (input.freeText.length > 90) {
    return `${input.companionName} lets the answer land before replying. "That felt specific enough to be real."`;
  }

  return `${input.companionName} stays close to the feeling. "I like this version of us. Keep going."`;
}

function isChapterTwoDateLocationKey(value: string): value is ChapterTwoDateLocationKey {
  return value === "cafe" || value === "cinema" || value === "bar";
}

function dateOptions(a: string, b: string, c: string): ChapterTwoDateOption[] {
  const catalog: Record<string, ChapterTwoDateOption> = {
    "after-credits": { id: "after_credits", label: "After credits", preview: "I name the feeling the story left behind and connect it to us.", tone: "honest intimate" },
    attention: { id: "attention", label: "Full attention", preview: "I notice what they react to instead of performing my own reaction.", tone: "curious attentive" },
    bold: { id: "bold", label: "Bold honesty", preview: "I say the charged thing clearly without making it a demand.", tone: "bold honest" },
    boundary: { id: "boundary", label: "Clear boundary", preview: "I name the line that keeps attraction from becoming pressure.", tone: "boundary trust" },
    "clear-invite": { id: "clear_invite", label: "Clear invite", preview: "I say I want another date and give them room to answer freely.", tone: "bold warm" },
    curious: { id: "curious", label: "Ask back", preview: "I turn the question toward them and make the date mutual.", tone: "curious" },
    daily: { id: "daily", label: "Daily detail", preview: "I describe one ordinary rhythm that would make closeness feel real.", tone: "stable intimate" },
    direct: { id: "direct", label: "Direct chemistry", preview: "I say what draws me in while staying respectful.", tone: "direct spark" },
    honest: { id: "honest", label: "Honest answer", preview: "I answer without polishing the feeling into a perfect line.", tone: "honest" },
    memory: { id: "memory", label: "Personal memory", preview: "I share a small memory that explains how I learned to care.", tone: "intimate" },
    next: { id: "next_date", label: "Next date", preview: "I suggest what I would want us to try next.", tone: "future warm" },
    playful: { id: "playful", label: "Playful ease", preview: "I let the moment smile before it gets serious.", tone: "playful warm" },
    protective: { id: "protective", label: "Protect the mood", preview: "I keep the shared feeling private instead of turning it into a performance.", tone: "trust intimate" },
    ritual: { id: "ritual", label: "Small ritual", preview: "I choose one repeatable habit that could belong only to us.", tone: "stable intimate" },
    "shared-laugh": { id: "shared_laugh", label: "Shared laugh", preview: "I admit the scene got me and let us laugh at the same thing.", tone: "playful" },
    slow: { id: "slow", label: "Slow burn", preview: "I ask to keep earning closeness one scene at a time.", tone: "slow trust" },
    soft: { id: "soft", label: "Soft truth", preview: "I say the honest thing gently enough to invite an honest reply.", tone: "honest intimate" },
    spark: { id: "spark", label: "Name the spark", preview: "I name the attraction without pretending it is the whole story.", tone: "spark honest" },
    specific: { id: "specific", label: "Specific detail", preview: "I answer with one concrete detail from the day instead of a mood.", tone: "honest specific" },
    steady: { id: "steady", label: "Steady answer", preview: "I stay grounded and show confidence through calm.", tone: "stable trust" },
    surprise: { id: "surprise", label: "Small surprise", preview: "I reveal a reaction they would not have guessed from me.", tone: "curious playful" },
    tease: { id: "tease", label: "Light tease", preview: "I make it playful without hiding the real answer.", tone: "playful" },
    truth: { id: "truth", label: "Plain truth", preview: "I tell the truth before the spell of the date fades.", tone: "honest intimate" },
    vulnerable: { id: "vulnerable", label: "Vulnerable edge", preview: "I admit what makes this kind of date both exciting and risky.", tone: "honest intimate" },
  };

  return [catalog[a]!, catalog[b]!, catalog[c]!];
}
