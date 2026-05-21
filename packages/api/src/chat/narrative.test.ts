import { describe, expect, it } from "vitest";

import { ZERO_DIMENSIONS } from "../relationships/level";
import { buildRelationshipNarrative } from "./narrative";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("buildRelationshipNarrative", () => {
  it("returns 'barely know them yet' for fresh zero state", () => {
    const text = buildRelationshipNarrative(
      { dimensions: { ...ZERO_DIMENSIONS }, first_met_at: NOW },
      NOW,
    );
    expect(text).toContain("earlier today");
    expect(text).toContain("Stranger");
    expect(text).toContain("barely know them yet");
  });

  it("renders 'in love' once romance is very high", () => {
    const text = buildRelationshipNarrative(
      {
        dimensions: { ...ZERO_DIMENSIONS, closeness: 75, trust: 70, romance: 90, friendship: 60 },
        first_met_at: NOW - 30 * DAY,
      },
      NOW,
    );
    expect(text).toMatch(/30 days ago/);
    expect(text).toContain("Lover");
    expect(text).toContain("deeply in love");
    expect(text).toContain("close and familiar");
    expect(text).toContain("trust them");
  });

  it("describes hostility above any positive trait", () => {
    const text = buildRelationshipNarrative(
      {
        dimensions: { ...ZERO_DIMENSIONS, friendship: 80, hostility: 70 },
        first_met_at: NOW - 5 * DAY,
      },
      NOW,
    );
    expect(text).toContain("Hostile");
    expect(text).toContain("real anger");
    expect(text).not.toContain("good friend");
  });

  it("notes 'close but guarded' when closeness high but trust low", () => {
    const text = buildRelationshipNarrative(
      {
        dimensions: { ...ZERO_DIMENSIONS, closeness: 55, trust: 10 },
        first_met_at: NOW - 7 * DAY,
      },
      NOW,
    );
    expect(text).toContain("close but still guarded");
  });

  it("never leaks numbers into the output", () => {
    const text = buildRelationshipNarrative(
      {
        dimensions: {
          closeness: 73,
          trust: 67,
          romance: 55,
          friendship: 62,
          hostility: 0,
          tension: 0,
          distance: 0,
        },
        first_met_at: NOW - 12 * DAY,
      },
      NOW,
    );
    // Only the "12 days ago" reference may carry a digit.
    const withoutDuration = text.replace(/\d+ days ago/, "").replace(/yesterday/, "");
    expect(withoutDuration).not.toMatch(/\d/);
  });

  it("handles missing first_met_at gracefully", () => {
    const text = buildRelationshipNarrative(
      { dimensions: { ...ZERO_DIMENSIONS }, first_met_at: null },
      NOW,
    );
    expect(text).toContain("Stranger");
  });
});
