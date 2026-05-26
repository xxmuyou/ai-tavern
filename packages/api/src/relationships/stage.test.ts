import { describe, expect, it } from "vitest";

import { ZERO_DIMENSIONS } from "./level";
import { deriveStage } from "./stage";

describe("deriveStage", () => {
  it("starts in first_contact", () => {
    expect(deriveStage(ZERO_DIMENSIONS).stage).toBe("first_contact");
  });

  it("walks the positive ladder", () => {
    expect(deriveStage({ ...ZERO_DIMENSIONS, closeness: 25 }).stage).toBe("familiar");
    expect(deriveStage({ ...ZERO_DIMENSIONS, closeness: 25, trust: 40 }).stage).toBe("trusted");
    expect(
      deriveStage({ ...ZERO_DIMENSIONS, closeness: 65, friendship: 55, trust: 45 }).stage,
    ).toBe("close_friend");
    expect(deriveStage({ ...ZERO_DIMENSIONS, romance: 40 }).stage).toBe("romantic_tension");
    expect(deriveStage({ ...ZERO_DIMENSIONS, romance: 60 }).stage).toBe("dating");
    expect(deriveStage({ ...ZERO_DIMENSIONS, romance: 80, trust: 60 }).stage).toBe("committed");
  });

  it("hostility overrides any positive state", () => {
    const result = deriveStage({
      ...ZERO_DIMENSIONS,
      romance: 80, trust: 70, hostility: 55,
    });
    expect(result.stage).toBe("hostile");
    expect(result.recommended_activity?.activity_type).toBe("repair");
  });

  it("distance overrides positive state", () => {
    const result = deriveStage({ ...ZERO_DIMENSIONS, friendship: 80, distance: 65 });
    expect(result.stage).toBe("estranged");
  });

  it("tension overrides positive state", () => {
    const result = deriveStage({ ...ZERO_DIMENSIONS, romance: 60, tension: 55 });
    expect(result.stage).toBe("strained");
  });

  it("dating does NOT activate when tension is high", () => {
    const result = deriveStage({ ...ZERO_DIMENSIONS, romance: 60, tension: 60 });
    // tension>50 -> strained takes over
    expect(result.stage).toBe("strained");
  });

  it("stage_progress is between 0 and 1", () => {
    for (let r = 0; r <= 100; r += 13) {
      const result = deriveStage({ ...ZERO_DIMENSIONS, romance: r });
      expect(result.stage_progress).toBeGreaterThanOrEqual(0);
      expect(result.stage_progress).toBeLessThanOrEqual(1);
    }
  });

  it("provides a next_goal until committed", () => {
    expect(deriveStage(ZERO_DIMENSIONS).next_goal).not.toBeNull();
    const committed = deriveStage({ ...ZERO_DIMENSIONS, romance: 80, trust: 60 });
    expect(committed.next_goal).toBeNull();
  });
});
