import { useCallback, useRef, useState } from 'react';

import { clearStoredAuthSession, sendChatMessage } from '@/api/companion-client';
import type { RelationshipDimensions } from '@/api/types';
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
};

export type SendOptions = ChatStreamCallbacks & {
  sceneId?: string;
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
      'You have reached your daily message limit.',
      402,
      'quota_exceeded',
    );
  }
  if (status === 429) {
    const retryAfter = typeof err.retryAfter === 'number' && err.retryAfter > 0 ? err.retryAfter : 60;
    return new RateLimitedError('You are sending messages too quickly.', retryAfter);
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

      try {
        const stream = sendChatMessage(companionId, { scene_id: options.sceneId, text });
        for await (const event of stream) {
          if (event.type === 'chunk') {
            const data = event.data as { text?: string } | undefined;
            const delta = typeof data?.text === 'string' ? data.text : '';
            if (delta) {
              buffer += delta;
              setStreamingText(buffer);
              options.onChunk?.(delta, buffer);
            }
          } else if (event.type === 'signals') {
            options.onSignals?.((event.data as Partial<RelationshipDimensions>) ?? {});
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
        return { emotion, text: buffer };
      } catch (rawError) {
        throw categorizeStreamError(rawError);
      } finally {
        activeRef.current = false;
        setIsStreaming(false);
        setStreamingText('');
      }
    },
    [companionId],
  );

  return { isStreaming, send, streamingText };
}
