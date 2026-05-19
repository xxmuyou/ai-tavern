import { readJsonArray } from "./json";
import type { CompanionStoryDefinition, CompanionStoryOption, CompanionStoryScene } from "./types";

export function companionStoryDefinition(name: string): CompanionStoryDefinition {
  return {
    scenes: companionStoryScenes(name),
  };
}

export function companionStoryScenes(name: string): CompanionStoryScene[] {
  return [
    {
      sceneTitle: "After-show message",
      prompt: `${name} sends the first message after the studio lights fade: "So, off camera, what part of tonight felt real to you?"`,
      options: companionStoryOptions("honest", "playful", "tender"),
    },
    {
      sceneTitle: "Quiet cafe",
      prompt: `${name} picks a quiet cafe table and asks what kind of day makes you feel most like yourself.`,
      options: companionStoryOptions("grounded", "curious", "bold"),
    },
    {
      sceneTitle: "Evening walk",
      prompt: `${name} slows down on an evening walk: "What should I learn about you slowly instead of all at once?"`,
      options: companionStoryOptions("boundary", "memory", "future"),
    },
  ];
}

export function companionStoryOptions(a: string, b: string, c: string): CompanionStoryOption[] {
  const catalog: Record<string, CompanionStoryOption> = {
    bold: { id: "bold", label: "Bold", preview: "I say what I want clearly, but leave room for your answer too." },
    boundary: { id: "boundary", label: "Boundary", preview: "I share one boundary that helps closeness feel safe instead of forced." },
    curious: { id: "curious", label: "Curious", preview: "I ask something back and let the moment become a two-way story." },
    future: { id: "future", label: "Future", preview: "I describe the kind of next scene I would want us to earn." },
    grounded: { id: "grounded", label: "Grounded", preview: "I answer with a small daily detail instead of a grand performance." },
    honest: { id: "honest", label: "Honest", preview: "I tell the truth about what made me nervous and what made me stay." },
    memory: { id: "memory", label: "Memory", preview: "I offer a personal memory that explains why I move the way I do." },
    playful: { id: "playful", label: "Playful", preview: "I keep it light, teasing, and warm enough to invite a smile." },
    tender: { id: "tender", label: "Tender", preview: "I answer softly and let the feeling breathe for a second." },
  };
  return [catalog[a]!, catalog[b]!, catalog[c]!];
}

export function companionResponseLine(input: {
  companionName: string;
  freeText: string;
  selectedOption: CompanionStoryOption | null;
}): string {
  const label = input.selectedOption?.label.toLowerCase() ?? "honest";
  if (label.includes("playful") || label.includes("bold")) {
    return `${input.companionName} laughs, but does not dodge the feeling. "Okay, that version of you is dangerous in a good way. Keep going."`;
  }

  if (label.includes("boundary")) {
    return `${input.companionName} nods slowly. "That actually makes me trust the scene more. I like knowing where the door is."`;
  }

  if (input.freeText.length > 80) {
    return `${input.companionName} listens longer than the cameras ever did. "That sounded like something I should remember, not just react to."`;
  }

  return `${input.companionName} softens. "That feels more like you than a perfect answer. I want the next scene."`;
}

export function readCompanionStoryOptions(value: string): CompanionStoryOption[] {
  return readJsonArray<Record<string, unknown>>(value)
    .map((option) => ({
      id: typeof option.id === "string" ? option.id : "",
      label: typeof option.label === "string" ? option.label : "",
      preview: typeof option.preview === "string" ? option.preview : "",
    }))
    .filter((option) => option.id && option.label && option.preview);
}

export function shouldRequirePlatformPass(input: {
  activeEntitlement: boolean;
  freeTurnLimit: number;
  storyTurnCount: number;
}): boolean {
  return !input.activeEntitlement && input.storyTurnCount >= input.freeTurnLimit;
}
