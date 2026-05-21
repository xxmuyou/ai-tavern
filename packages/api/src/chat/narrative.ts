import { computeLevel, type DimensionValues, type RelationshipLevel } from "../relationships/level";

export type RelationshipSnapshot = {
  dimensions: DimensionValues;
  first_met_at: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildRelationshipNarrative(snapshot: RelationshipSnapshot, now: number): string {
  const { dimensions, first_met_at } = snapshot;
  const lines: string[] = [];

  if (first_met_at && now >= first_met_at) {
    const days = Math.floor((now - first_met_at) / DAY_MS);
    if (days <= 0) {
      lines.push("You first met them earlier today.");
    } else if (days === 1) {
      lines.push("You first met them yesterday.");
    } else {
      lines.push(`You first met them ${days} days ago.`);
    }
  }

  const level: RelationshipLevel = computeLevel(dimensions);
  lines.push(`You think of them as a ${level}.`);

  const adjectives: string[] = [];
  const negativeDominant = level === "Hostile" || level === "Estranged" || level === "Strained";

  // Negative cues always run; positive cues are suppressed when a negative
  // level dominates so the LLM doesn't read "friendly + furious" simultaneously.
  if (dimensions.hostility >= 50) {
    adjectives.push("You feel real anger toward this user.");
  }
  if (dimensions.tension >= 50) {
    adjectives.push("Recent interactions have left things awkward.");
  }
  if (dimensions.distance >= 60) {
    adjectives.push("You've been keeping them at arm's length lately.");
  }

  if (!negativeDominant) {
    if (dimensions.closeness >= 70) {
      adjectives.push("You feel close and familiar with the user.");
    }
    if (dimensions.trust >= 60) {
      adjectives.push("You trust them.");
    }
    if (dimensions.trust <= 20 && dimensions.closeness >= 40) {
      adjectives.push("You're close but still guarded around them.");
    }
    if (dimensions.romance >= 80) {
      adjectives.push("You're deeply in love with them.");
    } else if (dimensions.romance >= 50) {
      adjectives.push("There is growing romantic tension between you.");
    }
    if (dimensions.friendship >= 60) {
      adjectives.push("They are a good friend to you.");
    }
  }

  if (adjectives.length === 0 && allZero(dimensions)) {
    adjectives.push("You barely know them yet.");
  }

  return [...lines, ...adjectives].join("\n");
}

function allZero(dims: DimensionValues): boolean {
  return (
    dims.closeness === 0 &&
    dims.trust === 0 &&
    dims.romance === 0 &&
    dims.friendship === 0 &&
    dims.hostility === 0 &&
    dims.tension === 0 &&
    dims.distance === 0
  );
}
