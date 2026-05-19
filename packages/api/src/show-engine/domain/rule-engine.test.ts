import { describe, expect, it } from "vitest";

import { applySignalsToGuest, reactionEventType } from "./rule-engine";
import type { RuleGuestState, SignalExtraction } from "./types";

const baseGuest: RuleGuestState = {
  affinityScore: 50,
  blowUpSignals: ["honesty", "humor"],
  characterKey: "mia",
  dealbreakerSignals: ["boundary_violation", "controlling"],
  dealbreakerTriggered: false,
  lightState: "on",
  name: "Mia",
  negativeSignals: ["arrogance", "rudeness"],
  positiveSignals: ["honesty", "humor", "warmth"],
  strongSignalCount: 0,
};

describe("rule engine", () => {
  it("raises affinity and can trigger blow-up on strong positive signals", () => {
    const signals: SignalExtraction = {
      dealbreakerSignals: [],
      negativeSignals: [],
      positiveSignals: ["honesty", "humor", "warmth"],
    };

    const outcome = applySignalsToGuest({ ...baseGuest, affinityScore: 78, strongSignalCount: 1 }, signals, 1);

    expect(outcome?.nextLightState).toBe("blow_up");
    expect(outcome?.nextAffinity).toBeGreaterThanOrEqual(85);
    expect(reactionEventType(outcome!)).toBe("blow_up");
  });

  it("turns light off when a dealbreaker is triggered", () => {
    const signals: SignalExtraction = {
      dealbreakerSignals: ["controlling"],
      negativeSignals: [],
      positiveSignals: [],
    };

    const outcome = applySignalsToGuest(baseGuest, signals, 1);

    expect(outcome?.dealbreakerTriggered).toBe(true);
    expect(outcome?.nextLightState).toBe("off");
    expect(reactionEventType(outcome!)).toBe("light_off");
  });

  it("ignores guests whose lights are already off", () => {
    const signals: SignalExtraction = {
      dealbreakerSignals: [],
      negativeSignals: [],
      positiveSignals: ["honesty"],
    };

    expect(applySignalsToGuest({ ...baseGuest, lightState: "off" }, signals, 1)).toBeNull();
  });
});
