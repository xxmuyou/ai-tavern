import type { CompanionPromptContext, NonNeutralEmotion } from "./types";

/**
 * Per-emotion prompt intents (spec-020 §E).
 *
 * Each value describes the facial/posture delta from the neutral portrait.
 * The base constraint block enforces identity preservation across all
 * generations.
 */
const EMOTION_INTENT: Record<NonNeutralEmotion, string> = {
  annoyed:
    "irritated expression, frown, clear displeasure without caricature; arms crossed or one hand resting on the hip",
  guarded:
    "reserved expression, lips pressed, slightly turned away; one arm drawn partially across the torso, shoulders angled back",
  playful:
    "teasing smile, slight eyebrow raise, light mischievous energy; one hand raised near the mouth or chin in a playful gesture",
  tense:
    "worried or conflicted expression, tightened mouth, subtle anxiety; hands clasped together or arms held slightly inward",
  warm:
    "soft eyes, gentle smile, approachable posture; open relaxed shoulders with one hand resting near the chest",
};

const BASE_CONSTRAINTS = [
  "Create a consistent half-body portrait variation of the same companion using the provided neutral portrait as the visual reference.",
  "Keep the same identity, face structure, hairstyle, body type, outfit style, color palette, framing, and crop.",
  "Use a half-body (waist-up) composition with the hands and arms visible.",
  "Change the facial expression, upper-body posture, and hand/arm gestures to express the requested emotion, while preserving identity.",
  // Anti-deformity guardrail: the emotion intents below ask for new arm/hand
  // poses. On img2img this can leave the source arms in place AND add the new
  // ones, producing extra limbs. Frame the gesture as repositioning the
  // existing limbs, and pin the body-part count.
  "The character has exactly one head, two arms, and two hands. Reposition the existing arms and hands into the new gesture — never add extra limbs, extra hands, or duplicate body parts. Anatomically correct.",
  "Transparent or clean simple background. No text. No extra characters. No age change. No style change.",
].join(" ");

/**
 * Global negative-prompt guardrail injected into RunningHub workflows'
 * negative text node (when the workflow declares one). Covers three failure
 * modes seen in production:
 *   1. Anatomy — duplicate limbs / multiple heads that img2img hallucinates when
 *      the prompt asks for a new arm/hand gesture.
 *   2. Multi-person — scene moments (café/park) "populate" themselves with
 *      extra people; these tags pin the output to a single subject.
 *   3. Camera device — gaze/scene wording can summon a literal camera, phone, or
 *      selfie composition; suppress the device itself.
 * RunningHub-only — OpenAI image edit has no negative input, so the positive
 * prompt (buildMomentPrompt) must also carry the single-subject / no-camera
 * constraints for the OpenAI path.
 */
export const ANATOMY_NEGATIVE =
  "extra limbs, extra arms, extra hands, extra fingers, duplicate limbs, multiple heads, two heads, deformed hands, malformed, mutated, fused body, disfigured, bad anatomy, " +
  "multiple people, multiple girls, multiple boys, 2girls, 2boys, 3girls, 3boys, crowd, group, couple, duo, trio, several people, background people, bystanders, extra person, another person, second character, " +
  "camera, holding camera, photographic equipment, dslr, smartphone, selfie";

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
