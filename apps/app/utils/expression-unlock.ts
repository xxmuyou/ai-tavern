// spec-025 §B4.4: gate higher emotions behind relationship stages while
// keeping the base set always available, so Phase-0's live portrait swapping
// never regresses for early-stage players. Mirrors the backend rules in
// packages/api/src/relationships/unlocks.ts — keep the two in sync.

const STAGE_RANK: Readonly<Record<string, number>> = {
  first_contact: 0,
  familiar: 1,
  trusted: 2,
  close_friend: 3,
  romantic_tension: 4,
  dating: 5,
  committed: 6,
};

// Always renderable regardless of stage.
const ALWAYS_AVAILABLE = new Set(['neutral', 'warm', 'guarded', 'annoyed']);

// Gated emotion -> minimum stage required.
const EMOTION_GATE: Readonly<Record<string, string>> = {
  playful: 'familiar',
  tense: 'trusted',
};

function rankOf(stage: string | null | undefined): number | null {
  if (!stage) return null;
  const rank = STAGE_RANK[stage];
  return rank === undefined ? null : rank;
}

/** Whether the given emotion may render at the given relationship stage. */
export function isEmotionUnlocked(emotion: string, stage: string | null | undefined): boolean {
  if (ALWAYS_AVAILABLE.has(emotion)) return true;
  const required = EMOTION_GATE[emotion];
  if (!required) return true; // not gated
  const have = rankOf(stage);
  const need = rankOf(required);
  if (have === null || need === null) return false;
  return have >= need;
}

/**
 * Resolve the emotion to actually display: the requested one if unlocked,
 * otherwise fall back to neutral. When `stage` is unknown, gating is skipped
 * (returns the requested emotion) so callers without stage info are unaffected.
 */
export function gateEmotion<T extends string>(emotion: T, stage: string | null | undefined): T | 'neutral' {
  if (stage == null) return emotion;
  return isEmotionUnlocked(emotion, stage) ? emotion : 'neutral';
}
