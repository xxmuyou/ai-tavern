import { describe, expect, it } from "vitest";

import { ZERO_DIMENSIONS } from "./level";
import { deriveStage } from "./stage";

describe("deriveStage", () => {
  it("starts in first_contact", () => {
    expect(deriveStage(ZERO_DIMENSIONS).stage).toBe("first_contact");
  });

  it("walks the positive ladder", () => {
    expect(deriveStage({ ...ZERO_DIMENSIONS, closeness: 20 }).stage).toBe("familiar");
    expect(deriveStage({ ...ZERO_DIMENSIONS, closeness: 25 }).stage).toBe("familiar");
    expect(deriveStage({ ...ZERO_DIMENSIONS, trust: 35 }).stage).toBe("trusted");
    expect(deriveStage({ ...ZERO_DIMENSIONS, closeness: 25, trust: 40 }).stage).toBe("trusted");
    expect(
      deriveStage({ ...ZERO_DIMENSIONS, closeness: 60, friendship: 50, trust: 40 }).stage,
    ).toBe("close_friend");
    expect(
      deriveStage({ ...ZERO_DIMENSIONS, closeness: 65, friendship: 55, trust: 45 }).stage,
    ).toBe("close_friend");
    expect(deriveStage({ ...ZERO_DIMENSIONS, romance: 30 }).stage).toBe("romantic_tension");
    expect(deriveStage({ ...ZERO_DIMENSIONS, romance: 40 }).stage).toBe("romantic_tension");
    expect(deriveStage({ ...ZERO_DIMENSIONS, romance: 50 }).stage).toBe("dating");
    expect(deriveStage({ ...ZERO_DIMENSIONS, romance: 60 }).stage).toBe("dating");
    expect(deriveStage({ ...ZERO_DIMENSIONS, romance: 75, trust: 55 }).stage).toBe("committed");
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

  // spec-035 regression: the familiar progress bar used to be (trust-20)/15, so
  // a player with low trust but growing closeness sat at 0% forever. It must now
  // move on closeness/friendship too.
  it("familiar progress moves when trust is low but closeness/friendship grow", () => {
    const stuck = deriveStage({ ...ZERO_DIMENSIONS, closeness: 20, trust: 11 });
    expect(stuck.stage).toBe("familiar");
    expect(stuck.stage_progress).toBeGreaterThan(0);

    const further = deriveStage({ ...ZERO_DIMENSIONS, closeness: 30, friendship: 20, trust: 11 });
    expect(further.stage).toBe("familiar");
    expect(further.stage_progress).toBeGreaterThan(stuck.stage_progress);
  });

  // spec-035: reaching "trusted" no longer hinges on trust alone — enough
  // closeness + friendship (the computeLevel "Friend" band) also counts.
  it("closeness + friendship alone can reach trusted (multi-path gate)", () => {
    expect(
      deriveStage({ ...ZERO_DIMENSIONS, closeness: 40, friendship: 30, trust: 5 }).stage,
    ).toBe("trusted");
    // and the original trust path still works
    expect(deriveStage({ ...ZERO_DIMENSIONS, trust: 30 }).stage).toBe("trusted");
  });

  // A run of ordinary friendly turns (closeness/friendship/trust each climbing a
  // little per turn) should advance the bar monotonically and eventually promote
  // out of familiar — the core "I'm playing but nothing moves" fix.
  it("sustained friendly signals advance progress and promote out of familiar", () => {
    let dims = { ...ZERO_DIMENSIONS };
    const progresses: number[] = [];
    let reachedTrusted = false;
    for (let turn = 0; turn < 30; turn += 1) {
      dims = {
        ...dims,
        closeness: Math.min(100, dims.closeness + 2),
        friendship: Math.min(100, dims.friendship + 2),
        trust: Math.min(100, dims.trust + 1),
      };
      const res = deriveStage(dims);
      if (res.stage === "familiar") progresses.push(res.stage_progress);
      if (res.stage === "trusted") reachedTrusted = true;
    }
    // progress within familiar was non-decreasing
    for (let i = 1; i < progresses.length; i += 1) {
      const prev = progresses[i - 1] ?? 0;
      const curr = progresses[i] ?? 0;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
    expect(reachedTrusted).toBe(true);
  });
});
