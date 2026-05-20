import { describe, expect, it } from "vitest";

import { ZERO_DIMENSIONS, clampDimension, clampSignal, computeLevel } from "./level";

describe("computeLevel", () => {
  it("returns Stranger for all-zero dimensions", () => {
    expect(computeLevel(ZERO_DIMENSIONS)).toBe("Stranger");
  });

  it("ladder: Acquaintance -> Friend -> Close Friend", () => {
    expect(computeLevel({ ...ZERO_DIMENSIONS, closeness: 25 })).toBe("Acquaintance");
    expect(computeLevel({ ...ZERO_DIMENSIONS, closeness: 50, friendship: 35 })).toBe("Friend");
    expect(
      computeLevel({ ...ZERO_DIMENSIONS, closeness: 70, friendship: 60, trust: 45 }),
    ).toBe("Close Friend");
  });

  it("romance ladder: Romantic Interest -> Lover (requires trust)", () => {
    expect(computeLevel({ ...ZERO_DIMENSIONS, romance: 35 })).toBe("Romantic Interest");
    // high romance but low trust does NOT promote to Lover
    expect(computeLevel({ ...ZERO_DIMENSIONS, romance: 80 })).toBe("Romantic Interest");
    expect(computeLevel({ ...ZERO_DIMENSIONS, romance: 80, trust: 60 })).toBe("Lover");
  });

  it("negative dimensions override positives", () => {
    const veryFriendly = {
      ...ZERO_DIMENSIONS,
      closeness: 80,
      friendship: 80,
      romance: 80,
      trust: 80,
    };
    expect(computeLevel(veryFriendly)).toBe("Lover");

    // hostility wins outright
    expect(computeLevel({ ...veryFriendly, hostility: 55 })).toBe("Hostile");
    // distance wins over romance/friendship
    expect(computeLevel({ ...veryFriendly, distance: 65 })).toBe("Estranged");
    // tension wins over romance/friendship
    expect(computeLevel({ ...veryFriendly, tension: 55 })).toBe("Strained");
  });

  it("negative priority order: Hostile > Estranged > Strained", () => {
    const allBad = { ...ZERO_DIMENSIONS, distance: 65, hostility: 55, tension: 55 };
    expect(computeLevel(allBad)).toBe("Hostile");
    expect(computeLevel({ ...allBad, hostility: 0 })).toBe("Estranged");
    expect(computeLevel({ ...allBad, distance: 0, hostility: 0 })).toBe("Strained");
  });
});

describe("clamps", () => {
  it("clamps dimensions to [0, 100]", () => {
    expect(clampDimension(-50)).toBe(0);
    expect(clampDimension(0)).toBe(0);
    expect(clampDimension(50)).toBe(50);
    expect(clampDimension(100)).toBe(100);
    expect(clampDimension(150)).toBe(100);
  });

  it("clamps signal deltas to [-5, +5]", () => {
    expect(clampSignal(-99)).toBe(-5);
    expect(clampSignal(-3)).toBe(-3);
    expect(clampSignal(0)).toBe(0);
    expect(clampSignal(5)).toBe(5);
    expect(clampSignal(20)).toBe(5);
  });
});
