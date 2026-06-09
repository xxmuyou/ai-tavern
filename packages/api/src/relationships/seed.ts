// Relationship initial-seed resolution (spec-013 修正记录 2026-06-09).
//
// `ensureRelationship` historically hardcoded all-zero / 'Stranger' and never
// consumed the companion's authored `initial_dims`, so a "crush"/"friend" preset
// had zero mechanical effect — every relationship opened as a Stranger. This
// module supplies the seed used on first contact via a single precedence chain:
//
//   companion.initial_dims (valid JSON)  ->  seedDimensionsForRole(role)  ->  zeros
//
// Design: "conservative / on the cusp". A non-stranger role only lifts `closeness`
// just past the Stranger line (20) so it no longer reads as a Stranger, while every
// other dimension stays low — leaving a real 15+ point gap to each signature
// milestone so progression is earned, not handed out. None of these seeds cross the
// trusted (secret) / romantic_tension gates. See docs/product/gameplay.md §8.1.

import {
  ALL_DIMENSIONS,
  type DimensionValues,
  ZERO_DIMENSIONS,
  clampDimension,
} from "./level";

/** Canonical relationship_role enum → starting dimensions (unlisted dims = 0). */
export const RELATIONSHIP_SEEDS: Readonly<Record<string, DimensionValues>> = {
  stranger: { ...ZERO_DIMENSIONS },
  neighbor: { ...ZERO_DIMENSIONS, closeness: 21, trust: 3, friendship: 5 },
  colleague: { ...ZERO_DIMENSIONS, closeness: 22, trust: 6, friendship: 8 },
  friend: { ...ZERO_DIMENSIONS, closeness: 24, trust: 10, friendship: 14 },
  family: { ...ZERO_DIMENSIONS, closeness: 25, trust: 12, friendship: 12 },
  crush: { ...ZERO_DIMENSIONS, closeness: 22, trust: 4, romance: 14, friendship: 5 },
};

// Free-text role phrasings (factory / legacy rows) → canonical enum. Keeps the
// seed lookup working even when a row predates口径收口. Unknown phrasings fall
// through to null (→ zero seed).
const ROLE_SYNONYMS: Readonly<Record<string, string>> = {
  "best friend": "friend",
  bestie: "friend",
  bff: "friend",
  "love interest": "crush",
  lover: "crush",
  partner: "crush",
  mentor: "colleague",
  coworker: "colleague",
  "co-worker": "colleague",
  classmate: "colleague",
  roommate: "neighbor",
  acquaintance: "neighbor",
  relative: "family",
  sibling: "family",
};

/**
 * Normalize a raw relationship_role to one of the 6 canonical enums, or null.
 * `trim().toLowerCase()`, then direct-enum match, then synonym map.
 */
export function normalizeRole(role: string | null | undefined): string | null {
  if (typeof role !== "string") return null;
  const key = role.trim().toLowerCase();
  if (key.length === 0) return null;
  if (key in RELATIONSHIP_SEEDS) return key;
  return ROLE_SYNONYMS[key] ?? null;
}

/** Default starting dimensions for a relationship_role (fallback when initial_dims is absent). */
export function seedDimensionsForRole(role: string | null | undefined): DimensionValues {
  const canonical = normalizeRole(role);
  const seed = canonical ? RELATIONSHIP_SEEDS[canonical] : undefined;
  return seed ? { ...seed } : { ...ZERO_DIMENSIONS };
}

/**
 * Parse a companion's stored `initial_dims` JSON into clamped dimensions.
 * Returns null when missing, malformed, or carrying no recognizable dimension,
 * so callers can fall back to the role-based default.
 */
export function parseInitialDims(json: string | null | undefined): DimensionValues | null {
  if (typeof json !== "string" || json.trim().length === 0) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  const out: DimensionValues = { ...ZERO_DIMENSIONS };
  let sawDimension = false;
  for (const dim of ALL_DIMENSIONS) {
    const value = record[dim];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[dim] = clampDimension(value);
      sawDimension = true;
    }
  }
  return sawDimension ? out : null;
}

/**
 * Resolve the seed for a companion's first relationship row via the precedence
 * chain: authored initial_dims → role default → zeros.
 */
export function resolveSeedDimensions(
  initialDims: string | null | undefined,
  role: string | null | undefined,
): DimensionValues {
  return parseInitialDims(initialDims) ?? seedDimensionsForRole(role);
}
