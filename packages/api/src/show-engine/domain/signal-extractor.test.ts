import { describe, expect, it } from "vitest";

import { extractSignals, hardPreferenceBoost, hardSignalsFromProfile, tagsFromSignals } from "./signal-extractor";

describe("signal extractor", () => {
  it("derives public profile tags only from answer signals", () => {
    const signals = extractSignals("I answer with honest warm humor, creative curiosity, and steady commitment.");

    expect(tagsFromSignals(signals)).toEqual(expect.arrayContaining(["honest", "humorous", "creative", "warm"]));
  });

  it("does not penalize unknown hard conditions", () => {
    const profile = {
      ageRange: "25-30",
      avatarObjectKey: null,
      hobbies: [],
      occupation: "",
    };

    expect(hardSignalsFromProfile(profile)).toEqual([]);
    expect(hardPreferenceBoost({ hardPreferenceSignals: ["tech_career", "music_hobby"] }, profile)).toBe(0);
  });

  it("boosts matching hard preferences without deciding the match", () => {
    const profile = {
      ageRange: "25-30",
      avatarObjectKey: null,
      hobbies: ["music", "travel"],
      occupation: "software product designer",
    };

    expect(hardSignalsFromProfile(profile)).toEqual(expect.arrayContaining(["music_hobby", "tech_career"]));
    expect(hardPreferenceBoost({ hardPreferenceSignals: ["music_hobby", "tech_career", "business_career"] }, profile)).toBe(8);
  });
});
