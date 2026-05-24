// Gender-weighted spawn sampling for scenes (spec-017).
//
// Tweak these constants to retune the spawn distribution operationally;
// later they may move to a config table, but for now a single source of truth
// in code is enough.

export type Gender = "male" | "female";
export type RomancePreference = Gender | "any";

export const PREFERENCE_WEIGHTS = {
  preferred: 0.8,
  opposite: 0.2,
  neutral: 0.5,
} as const;

export function weightFor(
  companionGender: Gender | null | undefined,
  userPreference: RomancePreference,
): number {
  if (userPreference === "any" || !companionGender) {
    return PREFERENCE_WEIGHTS.neutral;
  }
  return companionGender === userPreference
    ? PREFERENCE_WEIGHTS.preferred
    : PREFERENCE_WEIGHTS.opposite;
}

export type WeightedCandidate<T> = {
  candidate: T;
  source: "official" | "user";
  gender: Gender | null;
};

// Picks a subset of candidates honoring the user's romance preference.
//
// - `any`: no sampling — every candidate is returned unchanged.
// - `male`/`female`: official candidates pass a Bernoulli trial weighted by
//   `weightFor()`; user-created candidates are always kept (they are the
//   user's own work, not subject to preference filtering).
// - At least one candidate is always returned when the input is non-empty:
//   if every official candidate is rejected and no user candidates exist,
//   the official with the highest weight is force-kept.
//
// `rng` defaults to Math.random; tests inject deterministic generators.
export function sampleCompanionsByPreference<T>(
  candidates: ReadonlyArray<WeightedCandidate<T>>,
  userPreference: RomancePreference,
  rng: () => number = Math.random,
): T[] {
  if (candidates.length === 0) return [];
  if (userPreference === "any") return candidates.map((c) => c.candidate);

  const kept: T[] = [];
  const officialEntries: WeightedCandidate<T>[] = [];

  for (const entry of candidates) {
    if (entry.source === "user") {
      kept.push(entry.candidate);
      continue;
    }
    officialEntries.push(entry);
    const weight = weightFor(entry.gender, userPreference);
    if (rng() < weight) {
      kept.push(entry.candidate);
    }
  }

  if (kept.length === 0 && officialEntries.length > 0) {
    let best = officialEntries[0]!;
    let bestWeight = weightFor(best.gender, userPreference);
    for (let i = 1; i < officialEntries.length; i++) {
      const entry = officialEntries[i]!;
      const w = weightFor(entry.gender, userPreference);
      if (w > bestWeight) {
        best = entry;
        bestWeight = w;
      }
    }
    kept.push(best.candidate);
  }

  return kept;
}
