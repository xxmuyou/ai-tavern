import { useCallback, useState } from 'react';

import { getMessageVoice, regenerateChatMessage, selectMessageVariant } from '@/api/companion-client';
import type { ChatMessage, ChatMode } from '@/api/types';
import { playAudioUrl } from '@/utils/play-audio';

type HistoryLike = {
  updateMessage: (id: string, updater: (message: ChatMessage) => ChatMessage) => void;
};

type StreamingMessageLike = {
  beginStreamingExistingCompanionMessage: (messageId: string) => void;
  cleanupFailedStreamingCompanionMessage: (messageId: string, streamedText: string) => void;
  finishStreamingExistingCompanionMessage: (
    messageId: string,
    fullText: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => void;
  pushStreamingCompanionDelta: (messageId: string, delta: string) => void;
};

export type UseMessageActionsResult = {
  regeneratingId: string | null;
  speakingId: string | null;
  regenerate: (messageId: string) => Promise<void>;
  selectVariant: (messageId: string, index: number) => Promise<void>;
  speak: (messageId: string) => Promise<void>;
};

/**
 * Regenerate a companion reply (streams an alternative wording into the message)
 * and swipe between stored variants. Relationship state is untouched by both.
 */
export function useMessageActions(
  companionId: string,
  history: HistoryLike,
  onError?: (message: string) => void,
  onQuotaExceeded?: () => void,
  streaming?: StreamingMessageLike,
  chatMode?: ChatMode,
  storyId?: string | null,
): UseMessageActionsResult {
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const beginStreamingExistingCompanionMessage = streaming?.beginStreamingExistingCompanionMessage;
  const cleanupFailedStreamingCompanionMessage = streaming?.cleanupFailedStreamingCompanionMessage;
  const finishStreamingExistingCompanionMessage = streaming?.finishStreamingExistingCompanionMessage;
  const pushStreamingCompanionDelta = streaming?.pushStreamingCompanionDelta;

  const regenerate = useCallback(
    async (messageId: string) => {
      if (regeneratingId) {
        return;
      }
      setRegeneratingId(messageId);
      let buffer = '';
      let didFinish = false;
      beginStreamingExistingCompanionMessage?.(messageId);
      try {
        for await (const event of regenerateChatMessage(companionId, messageId, { chat_mode: chatMode, story_id: storyId ?? undefined })) {
          if (event.type === 'chunk') {
            const delta = (event.data as { text?: string } | undefined)?.text ?? '';
            if (delta) {
              buffer += delta;
              pushStreamingCompanionDelta?.(messageId, delta);
            }
          } else if (event.type === 'done') {
            const data = (event.data as { variants?: string[]; selected_variant?: number }) ?? {};
            const updater = (message: ChatMessage): ChatMessage => ({
              ...message,
              content: buffer || message.content,
              selected_variant: data.selected_variant ?? message.selected_variant ?? null,
              variants: data.variants ?? message.variants ?? null,
            });
            if (finishStreamingExistingCompanionMessage) {
              finishStreamingExistingCompanionMessage(messageId, buffer, updater);
            } else {
              history.updateMessage(messageId, updater);
            }
            didFinish = true;
          } else if (event.type === 'error') {
            const message = (event.data as { message?: string } | undefined)?.message ?? 'Regenerate failed.';
            throw new Error(message);
          }
        }
        if (!didFinish) {
          if (buffer) {
            const updater = (message: ChatMessage): ChatMessage => ({ ...message, content: buffer });
            if (finishStreamingExistingCompanionMessage) {
              finishStreamingExistingCompanionMessage(messageId, buffer, updater);
            } else {
              history.updateMessage(messageId, updater);
            }
          } else {
            cleanupFailedStreamingCompanionMessage?.(messageId, '');
          }
        }
      } catch (error) {
        if (!didFinish) {
          cleanupFailedStreamingCompanionMessage?.(messageId, buffer);
        }
        onError?.(error instanceof Error ? error.message : 'Could not regenerate the reply.');
      } finally {
        setRegeneratingId(null);
      }
    },
    [
      beginStreamingExistingCompanionMessage,
      cleanupFailedStreamingCompanionMessage,
      companionId,
      finishStreamingExistingCompanionMessage,
      history,
      chatMode,
      storyId,
      onError,
      pushStreamingCompanionDelta,
      regeneratingId,
    ],
  );

  const selectVariant = useCallback(
    async (messageId: string, index: number) => {
      try {
        const res = await selectMessageVariant(companionId, messageId, index);
        history.updateMessage(messageId, (message) => ({
          ...message,
          content: res.content,
          selected_variant: res.selected_variant,
          variants: res.variants,
        }));
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'Could not switch versions.');
      }
    },
    [companionId, history, onError],
  );

  const speak = useCallback(
    async (messageId: string) => {
      if (speakingId) {
        return;
      }
      setSpeakingId(messageId);
      try {
        const { url } = await getMessageVoice(companionId, messageId);
        await playAudioUrl(url);
      } catch (error) {
        const status = (error as Error & { status?: number }).status;
        if (status === 402 && onQuotaExceeded) {
          onQuotaExceeded?.();
        } else {
          onError?.(error instanceof Error ? error.message : 'Could not play the voice.');
        }
      } finally {
        setSpeakingId(null);
      }
    },
    [companionId, onError, onQuotaExceeded, speakingId],
  );

  return { regenerate, regeneratingId, selectVariant, speak, speakingId };
}
