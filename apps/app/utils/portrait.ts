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

/** Resolve the single base portrait. Emotion now drives UI tint/emoji only. */
export function resolvePortrait(
  _artEmotions: ArtEmotions,
  artUrl: string | null | undefined,
  _emotion: ChatEmotionKey,
): ImageSourcePropType | null {
  return mediaSource(artUrl ?? null);
}
