import { describe, expect, it } from "vitest";

import { negateSignals } from "./edit";

describe("negateSignals", () => {
  it("flips the sign of every provided dimension", () => {
    expect(negateSignals({ closeness: 3, trust: 1, distance: -2 })).toEqual({
      closeness: -3,
      distance: 2,
      trust: -1,
    });
  });

  it("ignores non-finite and missing dimensions", () => {
    expect(negateSignals({ closeness: Number.NaN, romance: 2 })).toEqual({ romance: -2 });
    expect(negateSignals({})).toEqual({});
  });
});
