import { asStringArray } from "./json";
import { clampDimensionValue } from "./dimensions";
import type { CharacterCard, DimensionDefinition, RelationshipComputation, RelationshipState, SceneOption } from "./types";

const POSITIVE_SIGNAL_EFFECTS: Record<string, Record<string, number>> = {
  care: { affection: 3, dependency: 1, trust: 2 },
  courage: { affection: 3, curiosity: 2, tension: 1 },
  creativity: { affection: 2, curiosity: 3 },
  honesty: { intimacy: 2, trust: 4 },
  humor: { affection: 3, curiosity: 1, tension: -1 },
  kindness: { affection: 2, caution: -2, trust: 3 },
  patience: { caution: -2, intimacy: 2, trust: 2 },
  specificity: { curiosity: 3, intimacy: 2, trust: 2 },
  stability: { dependency: 2, trust: 3 },
  warmth: { affection: 3, intimacy: 1 },
};

const BOUNDARY_SIGNAL_EFFECTS: Record<string, Record<string, number>> = {
  aggression: { affection: -8, caution: 12, tension: 10, trust: -12 },
  contempt: { affection: -8, caution: 12, tension: 8, trust: -10 },
  emotional_pressure: { caution: 8, tension: 6, trust: -5 },
  fake_confidence: { caution: 5, curiosity: -3, trust: -4 },
  performative_coolness: { affection: -3, caution: 4, trust: -3 },
  rudeness: { affection: -6, caution: 8, tension: 6, trust: -8 },
};

export function extractRelationshipSignals(text: string): string[] {
  const lower = text.toLowerCase();
  const dictionary: Record<string, string[]> = {
    aggression: ["attack", "hit", "threat", "violent"],
    care: ["care", "support", "present", "stay", "listen"],
    contempt: ["worthless", "disgusting", "look down", "contempt"],
    courage: ["brave", "bold", "risk", "courage"],
    creativity: ["music", "art", "write", "design", "creative", "imagine"],
    emotional_pressure: ["prove you love", "owe me", "must love", "pressure"],
    fake_confidence: ["always perfect", "never wrong", "best at everything"],
    honesty: ["honest", "truth", "real", "sincere", "transparent"],
    humor: ["funny", "joke", "laugh", "tease", "playful"],
    kindness: ["kind", "gentle", "respect", "warm"],
    patience: ["slow", "patient", "earn", "gradual"],
    performative_coolness: ["too cool", "image", "perform"],
    rudeness: ["rude", "insult", "mean", "humiliate"],
    specificity: ["because", "remember", "specific", "detail", "today"],
    stability: ["steady", "stable", "routine", "daily", "consistent"],
    warmth: ["warm", "soft", "tender", "affection"],
  };

  return Object.entries(dictionary)
    .filter(([, keywords]) => keywords.some((keyword) => lower.includes(keyword)))
    .map(([signal]) => signal);
}

export function computeRelationshipUpdate(input: {
  answerText: string;
  character: CharacterCard;
  definitions: Map<string, DimensionDefinition>;
  relationship: RelationshipState;
  selectedOption: SceneOption | null;
}): RelationshipComputation {
  const optionSignals = input.selectedOption?.signals ?? [];
  const textSignals = extractRelationshipSignals(input.answerText);
  const signals = [...new Set([...optionSignals, ...textSignals])];
  const preferenceSignals = new Set(asStringArray(input.character.dimensions.preferences));
  const boundarySignals = new Set(asStringArray(input.character.dimensions.boundaries));
  const deltas: Record<string, number> = {};

  for (const [dimension, delta] of Object.entries(input.selectedOption?.relationshipEffects ?? {})) {
    addDelta(deltas, dimension, delta);
  }

  for (const signal of signals) {
    const effect = boundarySignals.has(signal) ? BOUNDARY_SIGNAL_EFFECTS[signal] : POSITIVE_SIGNAL_EFFECTS[signal];
    if (!effect) {
      continue;
    }

    const preferenceMultiplier = preferenceSignals.has(signal) ? 1.35 : 1;
    for (const [dimension, delta] of Object.entries(effect)) {
      addDelta(deltas, dimension, Math.round(delta * preferenceMultiplier));
    }
  }

  const nextDimensions: Record<string, number> = { ...input.relationship.dimensions };
  for (const [dimension, delta] of Object.entries(deltas)) {
    const definition = input.definitions.get(dimension);
    nextDimensions[dimension] = clampDimensionValue((nextDimensions[dimension] ?? 0) + delta, definition);
  }

  return {
    deltas,
    memoryText: summarizeMemory(input.answerText, signals),
    nextDimensions,
    signals,
  };
}

function addDelta(target: Record<string, number>, dimension: string, delta: number): void {
  if (!Number.isFinite(delta)) {
    return;
  }

  target[dimension] = (target[dimension] ?? 0) + Math.round(delta);
}

function summarizeMemory(answerText: string, signals: string[]): string {
  const normalized = answerText.trim().replace(/\s+/g, " ").slice(0, 180);
  const signalText = signals.length ? ` Signals: ${signals.join(", ")}.` : "";
  return `${normalized || "The user answered through a structured option."}${signalText}`;
}
