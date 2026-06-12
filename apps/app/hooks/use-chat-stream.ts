import { useCallback, useRef, useState } from 'react';

import { clearStoredAuthSession, sendChatMessage } from '@/api/companion-client';
import type { ChatInviteResult, ChatQuickActionResult, ChatUnlock, RelationshipDimensions } from '@/api/types';
import {
  ApiError,
  NetworkError,
  QuotaExceededError,
  RateLimitedError,
  ServerError,
} from '@/hooks/use-api';

export const CHAT_EMOTIONS = ['warm', 'neutral', 'guarded', 'playful', 'tense', 'annoyed'] as const;
export type ChatEmotion = (typeof CHAT_EMOTIONS)[number];

export type ChatStreamDoneInfo = {
  messageId: string;
  warning?: string | null;
};

export type ChatStreamResult = {
  emotion: ChatEmotion | null;
  text: string;
};

export type ChatStreamCallbacks = {
  onChunk?: (delta: string, total: string) => void;
  onDone?: (info: ChatStreamDoneInfo, result: ChatStreamResult) => void;
  onEmotion?: (emotion: ChatEmotion) => void;
  onSignals?: (signals: Partial<RelationshipDimensions>) => void;
  onUnlocks?: (unlocks: ChatUnlock[]) => void;
  onInviteResult?: (result: ChatInviteResult) => void;
  onQuickActionResult?: (result: ChatQuickActionResult) => void;
};

export type SendOptions = ChatStreamCallbacks & {
  activityId?: string;
  sceneId?: string;
  personaId?: string;
  inviteSceneId?: string;
  quickAction?:
    | { type: 'gift'; item_id: 'coffee' | 'flowers' }
    | { type: 'scene_action'; action_id: string }
    | { type: 'custom_scene_action'; text: string };
};

function asEmotion(value: unknown): ChatEmotion | null {
  if (typeof value !== 'string') {
    return null;
  }
  return (CHAT_EMOTIONS as readonly string[]).includes(value) ? (value as ChatEmotion) : null;
}

function categorizeStreamError(rawError: unknown): Error {
  const err = rawError as Error & { code?: string; retryAfter?: number | null; status?: number };
  const status = err.status;

  if (status === 401) {
    clearStoredAuthSession();
    return new ApiError('Your session has expired. Please sign in again.', 401, 'unauthorized');
  }
  if (status === 402) {
    return new QuotaExceededError(
      "You don't have enough credits to send this message.",
      402,
      'credits_insufficient',
    );
  }
  if (status === 429) {
    const retryAfter = typeof err.retryAfter === 'number' && err.retryAfter > 0 ? err.retryAfter : 60;
    return new RateLimitedError('You are sending messages too quickly.', retryAfter);
  }
  if (err.code === 'content_filter') {
    return new ApiError(
      'That action was rejected by the model provider. Try a different description.',
      status,
      'content_filter',
    );
  }
  if (status && status >= 500) {
    return new ServerError(
      'The server is temporarily unavailable. Please try again later.',
      status,
      'server_error',
    );
  }
  if (err.code) {
    return new ApiError(err.message || 'The conversation was interrupted.', status, err.code);
  }
  if (!status) {
    return new NetworkError('Network connection lost.', undefined, 'network_error');
  }
  return rawError instanceof Error ? rawError : new Error('Stream failed.');
}

export type UseChatStreamResult = {
  isStreaming: boolean;
  send: (text: string, options?: SendOptions) => Promise<ChatStreamResult>;
  streamingText: string;
};

export function useChatStream(companionId: string): UseChatStreamResult {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const activeRef = useRef(false);

  const send = useCallback(
    async (text: string, options: SendOptions = {}): Promise<ChatStreamResult> => {
      if (activeRef.current) {
        throw new Error('A message is already streaming.');
      }
      activeRef.current = true;
      setIsStreaming(true);
      setStreamingText('');

      let buffer = '';
      let emotion: ChatEmotion | null = null;

      // Coalesce per-token chunks into ~20 UI updates per second; rendering
      // each token individually causes visible jank on long replies.
      let pendingDelta = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        flushTimer = null;
        if (!activeRef.current || pendingDelta.length === 0) {
          return;
        }
        const delta = pendingDelta;
        pendingDelta = '';
        setStreamingText(buffer);
        options.onChunk?.(delta, buffer);
      };
      const flushNow = () => {
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
        }
        flush();
      };

      try {
        const stream = sendChatMessage(companionId, {
          activity_id: options.activityId,
          invite_scene_id: options.inviteSceneId,
          persona_id: options.personaId,
          quick_action: options.quickAction,
          scene_id: options.sceneId,
          text,
        });
        for await (const event of stream) {
          if (event.type === 'chunk') {
            const data = event.data as { text?: string } | undefined;
            const delta = typeof data?.text === 'string' ? data.text : '';
            if (delta) {
              buffer += delta;
              pendingDelta += delta;
              if (flushTimer === null) {
                flushTimer = setTimeout(flush, 50);
              }
            }
          } else if (event.type === 'signals') {
            options.onSignals?.((event.data as Partial<RelationshipDimensions>) ?? {});
          } else if (event.type === 'unlocks') {
            const list = Array.isArray(event.data) ? (event.data as ChatUnlock[]) : [];
            if (list.length > 0) {
              options.onUnlocks?.(list);
            }
          } else if (event.type === 'invite_result') {
            const data = (event.data as Partial<ChatInviteResult> | undefined) ?? {};
            options.onInviteResult?.({
              accepted: data.accepted === true,
              activity_completed: data.activity_completed === true,
              reason: typeof data.reason === 'string' ? data.reason : '',
              scene_art_url: typeof data.scene_art_url === 'string' ? data.scene_art_url : null,
              scene_id: typeof data.scene_id === 'string' ? data.scene_id : null,
            });
          } else if (event.type === 'quick_action_result') {
            const data = (event.data as Partial<ChatQuickActionResult> | undefined) ?? {};
            options.onQuickActionResult?.({
              activity_id: typeof data.activity_id === 'string' ? data.activity_id : null,
              cooldown_until: typeof data.cooldown_until === 'number' ? data.cooldown_until : null,
              item_id: typeof data.item_id === 'string' ? data.item_id : '',
              memory_id: typeof data.memory_id === 'string' ? data.memory_id : null,
              ok: data.ok === true,
            });
          } else if (event.type === 'emotion') {
            const rawValue = (event.data as { value?: unknown } | undefined)?.value;
            const next = asEmotion(rawValue);
            if (__DEV__) {
              console.log('[chat] emotion event', { raw: rawValue, parsed: next });
            }
            if (next) {
              emotion = next;
              options.onEmotion?.(next);
            }
          } else if (event.type === 'done') {
            flushNow();
            const data = (event.data as { message_id?: string; warning?: string | null }) ?? {};
            if (__DEV__ && data.warning) {
              console.warn('[chat] stream done with warning', data.warning);
            }
            const info: ChatStreamDoneInfo = {
              messageId: data.message_id ?? '',
              warning: data.warning ?? null,
            };
            const result: ChatStreamResult = { emotion, text: buffer };
            options.onDone?.(info, result);
            return result;
          } else if (event.type === 'error') {
            const data = (event.data as { code?: string; message?: string }) ?? {};
            const err = new Error(data.message ?? data.code ?? 'Stream error.') as Error & {
              code?: string;
            };
            err.code = data.code ?? 'stream_error';
            throw err;
          }
        }
        flushNow();
        return { emotion, text: buffer };
      } catch (rawError) {
        throw categorizeStreamError(rawError);
      } finally {
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        activeRef.current = false;
        setIsStreaming(false);
        setStreamingText('');
      }
    },
    [companionId],
  );

  return { isStreaming, send, streamingText };
}
