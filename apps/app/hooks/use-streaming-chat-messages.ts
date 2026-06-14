import { useCallback, useEffect, useRef } from 'react';

import type { ChatEmotion } from '@/hooks/use-chat-stream';
import type { UseChatHistoryResult } from '@/hooks/use-chat-history';

function localMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type StreamingMessageState = {
  fullText: string;
  rafId: number | null;
  visibleText: string;
};

function requestRevealFrame(callback: () => void): number {
  const requestFrame = globalThis.requestAnimationFrame;
  if (requestFrame) {
    return requestFrame(callback);
  }
  return globalThis.setTimeout(callback, 16) as unknown as number;
}

function cancelRevealFrame(id: number) {
  const cancelFrame = globalThis.cancelAnimationFrame;
  if (cancelFrame) {
    cancelFrame(id);
    return;
  }
  globalThis.clearTimeout(id);
}

function revealStepFor(backlog: number): number {
  if (backlog > 80) return 16;
  if (backlog > 24) return 6;
  return 2;
}

export function useStreamingChatMessages(companionId: string, history: UseChatHistoryResult) {
  const streamsRef = useRef(new Map<string, StreamingMessageState>());

  useEffect(() => () => {
    for (const state of streamsRef.current.values()) {
      if (state.rafId !== null) {
        cancelRevealFrame(state.rafId);
      }
    }
    streamsRef.current.clear();
  }, []);

  const stopStreamingFrame = useCallback((messageId: string) => {
    const state = streamsRef.current.get(messageId);
    if (!state) return null;
    if (state.rafId !== null) {
      cancelRevealFrame(state.rafId);
      state.rafId = null;
    }
    streamsRef.current.delete(messageId);
    return state;
  }, []);

  const scheduleReveal = useCallback(function scheduleReveal(messageId: string) {
    const state = streamsRef.current.get(messageId);
    if (!state || state.rafId !== null) return;

    state.rafId = requestRevealFrame(() => {
      const nextState = streamsRef.current.get(messageId);
      if (!nextState) return;
      nextState.rafId = null;

      const backlog = nextState.fullText.length - nextState.visibleText.length;
      if (backlog <= 0) return;

      const nextLength = Math.min(
        nextState.fullText.length,
        nextState.visibleText.length + revealStepFor(backlog),
      );
      nextState.visibleText = nextState.fullText.slice(0, nextLength);
      history.updateMessage(messageId, (message) => (
        message.content === nextState.visibleText ? message : { ...message, content: nextState.visibleText }
      ));

      if (nextState.visibleText.length < nextState.fullText.length) {
        scheduleReveal(messageId);
      }
    });
  }, [history]);

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
    streamsRef.current.set(id, { fullText: '', rafId: null, visibleText: '' });
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

  const pushStreamingCompanionDelta = useCallback((messageId: string, delta: string) => {
    if (!delta) return;
    const state = streamsRef.current.get(messageId);
    if (!state) {
      history.updateMessage(messageId, (message) => ({ ...message, content: message.content + delta }));
      return;
    }
    state.fullText += delta;
    scheduleReveal(messageId);
  }, [history, scheduleReveal]);

  const finishStreamingCompanionMessage = useCallback((
    messageId: string,
    result: { emotion: ChatEmotion | null; text: string },
    serverMessageId: string,
    messageSceneId: string | null,
  ) => {
    stopStreamingFrame(messageId);
    history.replaceMessage(messageId, {
      companion_id: companionId,
      content: result.text,
      created_at: new Date().toISOString(),
      emotion: result.emotion,
      id: serverMessageId || messageId,
      role: 'companion',
      scene_id: messageSceneId,
    });
  }, [companionId, history, stopStreamingFrame]);

  const cleanupFailedStreamingCompanionMessage = useCallback((messageId: string, streamedText: string) => {
    const state = stopStreamingFrame(messageId);
    const text = streamedText || state?.fullText || state?.visibleText || '';
    if (text.trim().length === 0) {
      history.removeMessage(messageId);
      return;
    }
    history.updateMessage(messageId, (message) => ({ ...message, content: text }));
  }, [history, stopStreamingFrame]);

  return {
    appendLocalUserMessage,
    appendStreamingCompanionMessage,
    cleanupFailedStreamingCompanionMessage,
    finishStreamingCompanionMessage,
    pushStreamingCompanionDelta,
  };
}
