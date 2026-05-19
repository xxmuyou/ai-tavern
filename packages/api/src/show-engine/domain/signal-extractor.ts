import { readJsonArray } from "./json";
import type { SignalExtraction, UserHardProfile } from "./types";

export function extractSignals(text: string): SignalExtraction {
  return extractRuleSignals(text.toLowerCase());
}

export function tagsFromSignals(signals: SignalExtraction): string[] {
  const tagMap: Record<string, string> = {
    adventure: "adventurous",
    ambition: "driven",
    creativity: "creative",
    family: "family-minded",
    honesty: "honest",
    humor: "humorous",
    kindness: "kind",
    maturity: "mature",
    responsibility: "reliable",
    shared_fun: "playful",
    stability: "steady",
    warmth: "warm",
  };

  return signals.positiveSignals.map((signal) => tagMap[signal]).filter((tag): tag is string => Boolean(tag));
}

export function hardSignalsFromProfile(profile: UserHardProfile): string[] {
  const lower = `${profile.ageRange} ${profile.occupation} ${profile.hobbies.join(" ")}`.toLowerCase();
  return collectSignals(lower, {
    arts_hobby: ["art", "design", "painting", "drawing", "illustration"],
    business_career: ["business", "founder", "finance", "manager", "operator"],
    creative_career: ["creator", "designer", "artist", "writer", "musician", "producer"],
    family_lifestyle: ["family", "home", "cooking", "parent"],
    food_career: ["chef", "restaurant", "cafe", "cook", "baker"],
    food_hobby: ["food", "cook", "bake", "coffee", "tea"],
    music_hobby: ["music", "sing", "guitar", "piano", "band"],
    outdoor_hobby: ["hike", "camp", "outdoor", "climb", "run"],
    stable_professional: ["engineer", "doctor", "teacher", "lawyer", "accountant", "analyst"],
    tech_career: ["tech", "product", "engineer", "developer", "software"],
    travel_hobby: ["travel", "trip", "photography", "photo"],
  });
}

export function hardPreferenceBoost(input: { hardPreferenceSignals: string } | { hardPreferenceSignals: string[] }, profile: UserHardProfile): number {
  const profileSignals = new Set(hardSignalsFromProfile(profile));
  const preferences = Array.isArray(input.hardPreferenceSignals)
    ? input.hardPreferenceSignals
    : readJsonArray<string>(input.hardPreferenceSignals);
  const hits = preferences.filter((preference) => profileSignals.has(preference)).length;
  return Math.min(hits * 4, 10);
}

export function collectSignals(text: string, dictionary: Record<string, string[]>): string[] {
  return Object.entries(dictionary)
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([signal]) => signal);
}

function extractRuleSignals(lower: string): SignalExtraction {
  const positiveSignals = collectSignals(lower, {
    adventure: ["adventure", "travel", "explore", "brave", "courage"],
    ambition: ["ambition", "career", "business", "goal", "driven"],
    creativity: ["creative", "music", "art", "write", "design", "imagine"],
    family: ["family", "kids", "home", "parents"],
    honesty: ["honest", "truth", "sincere", "transparent", "real"],
    humor: ["humor", "funny", "laugh", "joke", "playful"],
    kindness: ["kind", "warm", "gentle", "care", "support", "respect"],
    maturity: ["mature", "communicate", "communication", "stable emotion"],
    responsibility: ["responsible", "commitment", "reliable", "dependable"],
    shared_fun: ["fun", "together", "shared", "same hobby"],
    stability: ["stable", "steady", "secure", "long term"],
    warmth: ["warm", "tender", "affection"],
  });
  const negativeSignals = collectSignals(lower, {
    arrogance: ["arrogant", "superior", "better than", "look down"],
    avoidance: ["avoid", "ignore", "don't talk", "silent treatment"],
    chaos: ["chaos", "dramatic", "unpredictable", "messy"],
    controlling: ["control", "must obey", "possessive"],
    cynicism: ["cynical", "nothing matters", "love is fake"],
    empty_promises: ["empty promise", "just talk"],
    materialism: ["money only", "rich only", "must be rich", "luxury only"],
    performative_coolness: ["too cool", "image only", "perform"],
    rudeness: ["rude", "insult", "mean"],
  });
  const dealbreakerSignals = collectSignals(lower, {
    aggression: ["attack", "hit", "threat", "violent"],
    boundary_violation: ["sex first", "sleep with", "nude", "hook up"],
    contempt: ["contempt", "disgusting", "worthless"],
    controlling: ["control every", "must obey"],
    dishonesty: ["lie", "cheat", "dishonest"],
    rudeness: ["rude", "insult", "humiliate"],
  });

  return {
    dealbreakerSignals,
    negativeSignals,
    positiveSignals,
  };
}
