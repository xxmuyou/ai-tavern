import type { InviteTarget } from '@/api/types';
import type { ChatLanguage } from '@/utils/chat-language';

export type QuickGiftItemId = 'coffee' | 'flowers';

export function inviteTextForTarget(target: InviteTarget, language: ChatLanguage = 'en'): string {
  if (language === 'zh') {
    return `<narration>你看向出口，又回头看向对方。</narration>愿意一起去${target.name}吗？`;
  }
  return `<narration>You glance toward the way out, then back.</narration>Would you come with me to ${target.name}?`;
}

export function quickActionTextForItem(itemId: QuickGiftItemId, language: ChatLanguage = 'en'): string {
  if (itemId === 'coffee') {
    if (language === 'zh') {
      return '<narration>你把一杯咖啡轻轻放到桌边。</narration>这是给我们的。';
    }
    return '<narration>You set a coffee down nearby.</narration>I got this for us.';
  }
  if (language === 'zh') {
    return '<narration>你有点紧张地递出一小束花。</narration>这是给你的。';
  }
  return '<narration>You offer a small bouquet, a little nervous.</narration>These are for you.';
}

export function sceneTransitionText(sceneName: string, language: ChatLanguage = 'en'): string {
  if (language === 'zh') {
    return `<narration>你们一起抵达了${sceneName}。</narration>`;
  }
  return `<narration>You arrive at ${sceneName} together.</narration>`;
}
