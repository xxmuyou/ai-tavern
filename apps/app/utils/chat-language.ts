import type { ChatMessage } from '@/api/types';

export type ChatLanguage = 'en' | 'zh';

const CJK_RE = /[\u3400-\u9fff]/;

export function detectChatLanguage(messages: ChatMessage[], draft?: string): ChatLanguage {
  if (draft && CJK_RE.test(draft)) return 'zh';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    return CJK_RE.test(message.content) ? 'zh' : 'en';
  }
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}
