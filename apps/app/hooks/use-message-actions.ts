import { useCallback, useState } from 'react';

import { getMessageVoice, regenerateChatMessage, selectMessageVariant } from '@/api/companion-client';
import type { ChatMessage } from '@/api/types';
import { playAudioUrl } from '@/utils/play-audio';

type HistoryLike = {
  updateMessage: (id: string, updater: (message: ChatMessage) => ChatMessage) => void;
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
): UseMessageActionsResult {
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const regenerate = useCallback(
    async (messageId: string) => {
      if (regeneratingId) {
        return;
      }
      setRegeneratingId(messageId);
      let buffer = '';
      try {
        for await (const event of regenerateChatMessage(companionId, messageId)) {
          if (event.type === 'chunk') {
            const delta = (event.data as { text?: string } | undefined)?.text ?? '';
            if (delta) {
              buffer += delta;
              history.updateMessage(messageId, (message) => ({ ...message, content: buffer }));
            }
          } else if (event.type === 'done') {
            const data = (event.data as { variants?: string[]; selected_variant?: number }) ?? {};
            history.updateMessage(messageId, (message) => ({
              ...message,
              content: buffer || message.content,
              selected_variant: data.selected_variant ?? message.selected_variant ?? null,
              variants: data.variants ?? message.variants ?? null,
            }));
          } else if (event.type === 'error') {
            const message = (event.data as { message?: string } | undefined)?.message ?? 'Regenerate failed.';
            throw new Error(message);
          }
        }
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'Could not regenerate the reply.');
      } finally {
        setRegeneratingId(null);
      }
    },
    [companionId, history, onError, regeneratingId],
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
        playAudioUrl(url);
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'Could not play the voice.');
      } finally {
        setSpeakingId(null);
      }
    },
    [companionId, onError, speakingId],
  );

  return { regenerate, regeneratingId, selectVariant, speak, speakingId };
}
