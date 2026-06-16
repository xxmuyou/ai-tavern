import { ALL_DIMENSIONS, clampSignal, type DimensionValues } from "../relationships/level";

export const RELATIONSHIP_SIGNAL_BOOST_MULTIPLIER = 1.5;

export type RelationshipSignalBoostReason = "favorite_scene" | "story_progress";

export type RelationshipSignalBoostResult = {
  multiplier: number;
  reasons: RelationshipSignalBoostReason[];
  signals: Partial<DimensionValues>;
};

type RelationshipSignalBoostInput = {
  preferredSceneIds: string[];
  sceneId: string | null;
  signals: Partial<DimensionValues>;
  storyProgressEligible: boolean;
};

export function applyRelationshipSignalBoost(input: RelationshipSignalBoostInput): RelationshipSignalBoostResult {
  const reasons = getRelationshipSignalBoostReasons(input);
  if (reasons.length === 0) {
    return { multiplier: 1, reasons, signals: input.signals };
  }

  const boosted: Partial<DimensionValues> = {};
  for (const dim of ALL_DIMENSIONS) {
    const value = input.signals[dim];
    if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
      if (value !== undefined) boosted[dim] = value;
      continue;
    }
    boosted[dim] = clampSignal(roundAwayFromZero(value * RELATIONSHIP_SIGNAL_BOOST_MULTIPLIER));
  }
  return { multiplier: RELATIONSHIP_SIGNAL_BOOST_MULTIPLIER, reasons, signals: boosted };
}

function getRelationshipSignalBoostReasons(input: RelationshipSignalBoostInput): RelationshipSignalBoostReason[] {
  const reasons: RelationshipSignalBoostReason[] = [];
  if (input.sceneId && input.preferredSceneIds.includes(input.sceneId)) {
    reasons.push("favorite_scene");
  }
  if (input.storyProgressEligible) {
    reasons.push("story_progress");
  }
  return reasons;
}

function roundAwayFromZero(value: number): number {
  return value < 0 ? -Math.ceil(Math.abs(value)) : Math.ceil(value);
}
