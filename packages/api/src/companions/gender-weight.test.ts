import { describe, expect, it } from "vitest";

import {
  PREFERENCE_WEIGHTS,
  sampleCompanionsByPreference,
  weightFor,
  type WeightedCandidate,
} from "./gender-weight";

type Candidate = { id: string };

function entry(id: string, gender: "male" | "female" | null, source: "official" | "user" = "official"): WeightedCandidate<Candidate> {
  return { candidate: { id }, gender, source };
}

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("gender-weight", () => {
  it("any preference returns every candidate untouched", () => {
    const candidates = [entry("a", "male"), entry("b", "female")];
    expect(sampleCompanionsByPreference(candidates, "any").map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("preferred gender has weight 0.8, opposite 0.2, unknown 0.5", () => {
    expect(weightFor("female", "female")).toBe(PREFERENCE_WEIGHTS.preferred);
    expect(weightFor("male", "female")).toBe(PREFERENCE_WEIGHTS.opposite);
    expect(weightFor(null, "female")).toBe(PREFERENCE_WEIGHTS.neutral);
    expect(weightFor("male", "any")).toBe(PREFERENCE_WEIGHTS.neutral);
  });

  it("user-source candidates are always kept regardless of preference", () => {
    const candidates = [entry("own", "male", "user"), entry("ryan", "male"), entry("maya", "female")];
    const picked = sampleCompanionsByPreference(candidates, "female", seededRng(1));
    expect(picked.map((c) => c.id)).toContain("own");
  });

  it("returns at least one candidate when input is non-empty (force-keep highest weight)", () => {
    const rngAlwaysReject = () => 0.99; // every Bernoulli trial fails
    const candidates = [entry("ryan", "male"), entry("ethan", "male"), entry("maya", "female")];
    const picked = sampleCompanionsByPreference(candidates, "female", rngAlwaysReject);
    expect(picked).toHaveLength(1);
    expect(picked[0]?.id).toBe("maya"); // female wins on weight 0.8 vs males' 0.2
  });

  it("distribution roughly matches weights over many trials", () => {
    const candidates = [entry("m1", "male"), entry("m2", "male"), entry("f1", "female"), entry("f2", "female")];
    const counts = { male: 0, female: 0 };
    const trials = 2000;
    const rng = seededRng(42);
    for (let i = 0; i < trials; i++) {
      const picked = sampleCompanionsByPreference(candidates, "female", rng);
      for (const c of picked) {
        if (c.id.startsWith("m")) counts.male++;
        else counts.female++;
      }
    }
    const total = counts.male + counts.female;
    const femaleRatio = counts.female / total;
    // Expected ~0.8 / (0.8+0.2) = 0.8 — allow generous tolerance for randomness.
    expect(femaleRatio).toBeGreaterThan(0.7);
    expect(femaleRatio).toBeLessThan(0.9);
  });
});
