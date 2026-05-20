export const ALL_DIMENSIONS = [
  "closeness",
  "trust",
  "romance",
  "friendship",
  "hostility",
  "tension",
  "distance",
] as const;

export type Dimension = (typeof ALL_DIMENSIONS)[number];

export type DimensionValues = Record<Dimension, number>;

export type RelationshipLevel =
  | "Stranger"
  | "Acquaintance"
  | "Friend"
  | "Close Friend"
  | "Romantic Interest"
  | "Lover"
  | "Strained"
  | "Estranged"
  | "Hostile";

export const ZERO_DIMENSIONS: DimensionValues = {
  closeness: 0,
  distance: 0,
  friendship: 0,
  hostility: 0,
  romance: 0,
  tension: 0,
  trust: 0,
};

/**
 * Map the 7 singularity dimensions to a human-readable relationship level.
 *
 * Negative-valence levels (Hostile / Estranged / Strained) take precedence
 * over positive-valence ones — a Hostile relationship reads as Hostile even
 * if friendship is high, matching docs/product/gameplay.md §6.1.
 */
export function computeLevel(dims: DimensionValues): RelationshipLevel {
  if (dims.hostility > 50) return "Hostile";
  if (dims.distance > 60) return "Estranged";
  if (dims.tension > 50) return "Strained";

  if (dims.romance > 70 && dims.trust > 50) return "Lover";
  if (dims.romance > 30) return "Romantic Interest";

  if (dims.closeness > 60 && dims.friendship > 50 && dims.trust > 40) return "Close Friend";
  if (dims.closeness > 40 && dims.friendship > 30) return "Friend";
  if (dims.closeness > 20) return "Acquaintance";

  return "Stranger";
}

export function clampDimension(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value | 0;
}

export function clampSignal(value: number): number {
  if (value < -5) return -5;
  if (value > 5) return 5;
  return value | 0;
}
