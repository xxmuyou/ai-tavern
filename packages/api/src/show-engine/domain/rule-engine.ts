import type { LightState, RuleGuestState, SignalApplication, SignalExtraction } from "./types";

export function applySignalsToGuest(
  guest: RuleGuestState,
  signals: SignalExtraction,
  multiplier: number,
): SignalApplication | null {
  if (guest.lightState === "off") {
    return null;
  }

  const positiveHits = countOverlap(signals.positiveSignals, guest.positiveSignals);
  const negativeHits = countOverlap(signals.negativeSignals, guest.negativeSignals);
  const dealbreakerHits = countOverlap(signals.dealbreakerSignals, guest.dealbreakerSignals);
  const blowUpHits = countOverlap(signals.positiveSignals, guest.blowUpSignals);
  const delta = Math.round((positiveHits * 8 - negativeHits * 7) * multiplier);
  const nextAffinity = clamp(guest.affinityScore + delta, 0, 100);
  const nextStrongSignalCount = guest.strongSignalCount + blowUpHits;
  const dealbreakerTriggered = guest.dealbreakerTriggered || dealbreakerHits > 0;
  const nextLightState = nextLightStateFor({
    dealbreakerTriggered,
    nextAffinity,
    nextStrongSignalCount,
  });

  return {
    characterKey: guest.characterKey,
    dealbreakerHits,
    dealbreakerTriggered,
    delta,
    name: guest.name,
    negativeHits,
    nextAffinity,
    nextLightState,
    nextStrongSignalCount,
    positiveHits,
    previousLightState: guest.lightState,
  };
}

export function reactionEventType(outcome: SignalApplication): "blow_up" | "guest_doubt" | "guest_heart" | "guest_object" | "light_off" {
  if (outcome.nextLightState === "off" && outcome.previousLightState !== "off") {
    return "light_off";
  }

  if (outcome.nextLightState === "blow_up" && outcome.previousLightState !== "blow_up") {
    return "blow_up";
  }

  if (outcome.dealbreakerHits > 0 || outcome.negativeHits > 0) {
    return outcome.dealbreakerHits > 0 ? "guest_object" : "guest_doubt";
  }

  return "guest_heart";
}

export function reactionLine(outcome: SignalApplication): string {
  if (outcome.nextLightState === "off" && outcome.previousLightState !== "off") {
    return `${outcome.name}: That crosses a line for me. I am turning my light off.`;
  }

  if (outcome.nextLightState === "blow_up" && outcome.previousLightState !== "blow_up") {
    return `${outcome.name}: That answer lands. My light is going all the way up.`;
  }

  if (outcome.dealbreakerHits > 0) {
    return `${outcome.name}: I need to push back on that. It does not feel respectful enough for me.`;
  }

  if (outcome.negativeHits > 0 || outcome.delta < 0) {
    return `${outcome.name}: I am not fully comfortable with that answer. I need more care and clarity.`;
  }

  if (outcome.positiveHits > 0 || outcome.delta > 0) {
    return `${outcome.name}: That feels specific. I believe that more than a polished line.`;
  }

  return `${outcome.name}: I am still listening. Keep it real.`;
}

export function countOverlap(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function nextLightStateFor(input: {
  dealbreakerTriggered: boolean;
  nextAffinity: number;
  nextStrongSignalCount: number;
}): LightState {
  if (input.dealbreakerTriggered || input.nextAffinity <= 15) {
    return "off";
  }

  if (input.nextAffinity >= 85 || input.nextStrongSignalCount >= 3) {
    return "blow_up";
  }

  return "on";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
