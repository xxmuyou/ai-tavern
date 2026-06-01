import type { ImageSourcePropType } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { ChatEmotionKey } from '@/api/types';

// Shared portrait/emotion presentation constants. Used by the in-chat
// PortraitBar, the companion profile portrait gallery, and the full-screen
// viewer so all three stay visually consistent.

export type ArtEmotions = Partial<Record<ChatEmotionKey, string>> | null | undefined;

// Source aspect ratio of the generated portraits (width / height).
export const PORTRAIT_ASPECT = 1023 / 1535;

// Display order for the portrait gallery: base emotions first, gated ones
// interleaved next to their tonal neighbours.
export const EMOTION_ORDER: ChatEmotionKey[] = [
  'neutral',
  'warm',
  'playful',
  'guarded',
  'tense',
  'annoyed',
];

export const EMOTION_LABEL: Record<ChatEmotionKey, string> = {
  annoyed: 'annoyed',
  guarded: 'guarded',
  neutral: 'neutral',
  playful: 'playful',
  tense: 'tense',
  warm: 'warm',
};

export const EMOTION_EMOJI: Record<ChatEmotionKey, string> = {
  annoyed: '😤',
  guarded: '😶',
  neutral: '😐',
  playful: '😏',
  tense: '😟',
  warm: '😊',
};

export const EMOTION_TINT: Record<ChatEmotionKey, string> = {
  annoyed: '#C0524A',
  guarded: '#6E7B8A',
  neutral: '#8C8F94',
  playful: '#D4A33C',
  tense: '#A85A8E',
  warm: '#E89B6A',
};

/**
 * Resolve the image source for a portrait, falling back to the base neutral
 * art when the requested emotion has no dedicated art. This fallback is what
 * the in-chat PortraitBar wants (never show a blank bar); the gallery resolves
 * per-emotion art directly instead, so an ungenerated emotion reads as empty
 * rather than silently showing the neutral image.
 */
export function resolvePortrait(
  artEmotions: ArtEmotions,
  artUrl: string | null | undefined,
  emotion: ChatEmotionKey,
): ImageSourcePropType | null {
  const raw = (artEmotions && artEmotions[emotion]) || artUrl || null;
  return mediaSource(raw);
}
