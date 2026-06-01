// Expression availability for the in-chat live portrait.
//
// Expressions are no longer gated by relationship stage. Base emotions stay
// always available so Phase-0's live tint/label feedback never regresses; the
// previously stage-gated expressions (playful, tense) now render in chat only
// once their art has been generated. Generating that art is subscription-gated
// and triggered manually from the profile portrait gallery — see
// components/CompanionGalleryPanel.tsx and the backend
// packages/api/src/companions/emotion-art-routes.ts.

import type { ChatEmotionKey } from '@/api/types';
import type { ArtEmotions } from '@/utils/portrait';

// Always renderable for live emotional feedback, even without dedicated art
// (PortraitBar falls back to the neutral image).
const ALWAYS_AVAILABLE: ReadonlySet<string> = new Set(['neutral', 'warm', 'guarded', 'annoyed']);

/**
 * Whether the given emotion may render live in chat. Base emotions are always
 * on; the unlockable expressions (playful, tense) appear only once their art
 * has actually been generated.
 */
export function isEmotionUnlocked(emotion: string, artEmotions: ArtEmotions): boolean {
  if (ALWAYS_AVAILABLE.has(emotion)) return true;
  return Boolean(artEmotions?.[emotion as ChatEmotionKey]);
}

/**
 * Resolve the emotion to actually display in chat: the requested one if it may
 * render, otherwise fall back to neutral.
 */
export function gateEmotion<T extends string>(emotion: T, artEmotions: ArtEmotions): T | 'neutral' {
  return isEmotionUnlocked(emotion, artEmotions) ? emotion : 'neutral';
}
