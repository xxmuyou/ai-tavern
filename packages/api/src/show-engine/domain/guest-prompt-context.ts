import { readStringList } from "./json";

export type GuestPromptSnapshot = Record<string, unknown>;

export type GuestPromptContextInput = {
  currentAffinity?: number | null;
  guestName: string;
  recentConversation?: string;
  snapshot: GuestPromptSnapshot;
  stageKey?: string;
  userBackground?: string;
  userInput?: string;
};

export function buildGuestPromptContext(input: GuestPromptContextInput): string {
  const snapshot = input.snapshot;
  const lines = [
    `Guest: ${input.guestName}`,
    `Identity: ${compact([
      readString(snapshot.ageRange),
      readString(snapshot.occupationTag) || readString(snapshot.occupation),
      readString(snapshot.cityOrLifestyle),
      readStringList(snapshot.hobbies, 8).join(", "),
    ])}`,
    `Relationship role: ${readString(snapshot.relationshipToUser) || "dating-show guest evaluating the contestant"}`,
    `Personality: ${readString(snapshot.personality) || "open, curious, emotionally present"}`,
    `Goal: ${readString(snapshot.goal) || "Decide whether the contestant feels compatible."}`,
    `Speaking style: ${readString(snapshot.speakingStyle) || "natural, concise, specific"}`,
    `Hidden preferences: ${readString(snapshot.hiddenPreferences) || compact(readStringList(snapshot.preferences, 8))}`,
    `Boundaries: ${readString(snapshot.boundaries) || compact(readStringList(snapshot.dealbreakers, 8))}`,
    `Positive signals: ${compact(readStringList(snapshot.positiveSignals, 12))}`,
    `Negative signals: ${compact(readStringList(snapshot.negativeSignals, 12))}`,
    `Dealbreakers: ${compact(readStringList(snapshot.dealbreakerSignals, 12))}`,
    `Strong attraction signals: ${compact(readStringList(snapshot.blowUpSignals, 12))}`,
    `Hard preference signals: ${compact(readStringList(snapshot.hardPreferenceSignals, 12))}`,
    `Soft preference signals: ${compact(readStringList(snapshot.softPreferenceSignals, 12))}`,
  ];

  if (typeof input.currentAffinity === "number") {
    lines.push(`Current affinity: ${input.currentAffinity}`);
  }
  if (input.stageKey) {
    lines.push(`Stage: ${input.stageKey}`);
  }
  if (input.userBackground) {
    lines.push(`Contestant background: ${input.userBackground}`);
  }
  if (input.userInput) {
    lines.push(`Contestant latest input: ${input.userInput}`);
  }
  if (input.recentConversation) {
    lines.push(`Recent conversation:\n${input.recentConversation}`);
  }

  return lines.join("\n");
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compact(values: Array<string | undefined> | string[]): string {
  const text = values.map((value) => value?.trim()).filter(Boolean).join(", ");
  return text || "none";
}
