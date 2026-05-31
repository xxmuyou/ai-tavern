import type { CompanionPromptContext, NonNeutralEmotion } from "./types";

/**
 * Per-emotion prompt intents (spec-020 §E).
 *
 * Each value describes the facial/posture delta from the neutral portrait.
 * The base constraint block enforces identity preservation across all
 * generations.
 */
const EMOTION_INTENT: Record<NonNeutralEmotion, string> = {
  annoyed: "irritated expression, frown, clear displeasure without caricature",
  guarded: "reserved expression, lips pressed, slightly turned away",
  playful: "teasing smile, slight eyebrow raise, light mischievous energy",
  tense: "worried or conflicted expression, tightened mouth, subtle anxiety",
  warm: "soft eyes, gentle smile, approachable posture",
};

const BASE_CONSTRAINTS = [
  "Create a consistent portrait variation of the same companion using the provided neutral portrait as the visual reference.",
  "Keep the same identity, face structure, hairstyle, body type, outfit style, color palette, camera angle, and portrait composition.",
  "Only change facial expression and subtle body posture to match the requested emotion.",
  "Transparent or clean simple background. No text. No extra characters. No age change. No style change.",
].join(" ");

export function buildEmotionPrompt(
  emotion: NonNeutralEmotion,
  companion: CompanionPromptContext,
  intentOverride?: string | null,
): string {
  const intent = intentOverride?.trim() || EMOTION_INTENT[emotion];
  const lines = [
    BASE_CONSTRAINTS,
    `Target emotion: ${emotion} — ${intent}.`,
    `Companion name: ${companion.name}.`,
  ];
  if (companion.gender) lines.push(`Gender: ${companion.gender}.`);
  if (companion.relationship_role) lines.push(`Relationship role: ${companion.relationship_role}.`);
  if (companion.appearance) lines.push(`Appearance: ${companion.appearance}.`);
  if (companion.personality) lines.push(`Personality cue: ${companion.personality}.`);
  return lines.join("\n");
}

export { EMOTION_INTENT };
