import type { InviteTarget } from '@/api/types';

export type QuickGiftItemId = 'coffee' | 'flowers';

export function inviteTextForTarget(target: InviteTarget): string {
  return `<narration>I glance toward the way out, then back at you.</narration>Would you come with me to ${target.name}?`;
}

export function quickActionTextForItem(itemId: QuickGiftItemId): string {
  if (itemId === 'coffee') {
    return '<narration>I set a coffee down near you.</narration>I got this for us.';
  }
  return '<narration>I offer you a small bouquet, a little nervous.</narration>These are for you.';
}

export function sceneTransitionText(sceneName: string): string {
  return `<narration>You arrive at ${sceneName} together.</narration>`;
}
