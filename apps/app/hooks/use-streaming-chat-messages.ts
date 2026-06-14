import { useCallback } from 'react';

import type { ChatEmotion } from '@/hooks/use-chat-stream';
import type { UseChatHistoryResult } from '@/hooks/use-chat-history';

function localMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useStreamingChatMessages(companionId: string, history: UseChatHistoryResult) {
  const appendLocalUserMessage = useCallback((content: string, messageSceneId: string | null = null) => {
    history.appendMessage({
      companion_id: companionId,
      content,
      created_at: new Date().toISOString(),
      id: localMessageId('local-user'),
      role: 'user',
      scene_id: messageSceneId,
    });
  }, [companionId, history]);

  const appendStreamingCompanionMessage = useCallback((messageSceneId: string | null = null) => {
    const id = localMessageId('local-companion');
    history.appendMessage({
      companion_id: companionId,
      content: '',
      created_at: new Date().toISOString(),
      id,
      role: 'companion',
      scene_id: messageSceneId,
    });
    return id;
  }, [companionId, history]);

  const updateStreamingCompanionMessage = useCallback((messageId: string, content: string) => {
    history.updateMessage(messageId, (message) => ({ ...message, content }));
  }, [history]);

  const finishStreamingCompanionMessage = useCallback((
    messageId: string,
    result: { emotion: ChatEmotion | null; text: string },
    serverMessageId: string,
    messageSceneId: string | null,
  ) => {
    history.replaceMessage(messageId, {
      companion_id: companionId,
      content: result.text,
      created_at: new Date().toISOString(),
      emotion: result.emotion,
      id: serverMessageId || messageId,
      role: 'companion',
      scene_id: messageSceneId,
    });
  }, [companionId, history]);

  const cleanupFailedStreamingCompanionMessage = useCallback((messageId: string, streamedText: string) => {
    if (streamedText.trim().length === 0) {
      history.removeMessage(messageId);
      return;
    }
    history.updateMessage(messageId, (message) => ({ ...message, content: streamedText }));
  }, [history]);

  return {
    appendLocalUserMessage,
    appendStreamingCompanionMessage,
    cleanupFailedStreamingCompanionMessage,
    finishStreamingCompanionMessage,
    updateStreamingCompanionMessage,
  };
}
