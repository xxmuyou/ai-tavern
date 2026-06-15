import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatEmotion } from '@/hooks/use-chat-stream';
import type { UseChatHistoryResult } from '@/hooks/use-chat-history';
import type { ChatMessage } from '@/api/types';

function localMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type StreamingMessageState = {
  commit: StreamingCommit | null;
  fullText: string;
  mode: 'local' | 'existing';
  rafId: number | null;
  visibleText: string;
  listeners: Set<() => void>;
};

type StreamingCommit =
  | { kind: 'replace'; message: ChatMessage }
  | { kind: 'update'; updater: (message: ChatMessage) => ChatMessage };

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

// How many characters to reveal this frame given the outstanding backlog.
// We catch up quickly (half the backlog) so it tracks fast streaming, but cap the
// per-frame jump: even when a whole paragraph arrives in one burst it is typed out
// as a fast, continuous stream (~MAX_STEP * 60 ≈ 720 chars/s) instead of dumping at
// once — that continuity is what reads as "silky". The floor keeps slow trickles
// moving so the cursor never visibly stalls.
const MIN_STEP = 2;
const MAX_STEP = 12;
function revealStep(backlog: number): number {
  return Math.min(MAX_STEP, Math.max(MIN_STEP, Math.ceil(backlog * 0.5)));
}

export type StreamSubscribe = (messageId: string, onChange: () => void) => () => void;
export type StreamSnapshot = (messageId: string) => string;

export function useStreamingChatMessages(companionId: string, history: UseChatHistoryResult) {
  const streamsRef = useRef(new Map<string, StreamingMessageState>());
  // The id of the companion message currently streaming, if any. This flips at
  // most twice per reply (start + finish) — never per token — so the chat screen
  // does not re-render while text streams; only the isolated bubble does.
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const { appendMessage, removeMessage, replaceMessage, updateMessage } = history;

  useEffect(() => () => {
    for (const state of streamsRef.current.values()) {
      if (state.rafId !== null) {
        cancelRevealFrame(state.rafId);
      }
    }
    streamsRef.current.clear();
  }, []);

  const ensureState = useCallback((messageId: string): StreamingMessageState => {
    let state = streamsRef.current.get(messageId);
    if (!state) {
      state = {
        commit: null,
        fullText: '',
        listeners: new Set(),
        mode: 'local',
        rafId: null,
        visibleText: '',
      };
      streamsRef.current.set(messageId, state);
    }
    return state;
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

  // Subscribe to a streaming message's revealed text. Used by the isolated
  // streaming bubble via useSyncExternalStore so token updates re-render only
  // that bubble and never touch the screen-level message list.
  const subscribeStream = useCallback<StreamSubscribe>((messageId, onChange) => {
    const state = ensureState(messageId);
    state.listeners.add(onChange);
    return () => {
      streamsRef.current.get(messageId)?.listeners.delete(onChange);
    };
  }, [ensureState]);

  const getStreamSnapshot = useCallback<StreamSnapshot>((messageId) => {
    return streamsRef.current.get(messageId)?.visibleText ?? '';
  }, []);

  const commitFinishedStream = useCallback((messageId: string, state: StreamingMessageState) => {
    if (!state.commit || state.visibleText.length < state.fullText.length) {
      return false;
    }

    const commit = state.commit;
    streamsRef.current.delete(messageId);
    if (commit.kind === 'replace') {
      replaceMessage(messageId, commit.message);
    } else {
      updateMessage(messageId, commit.updater);
    }
    setStreamingId((current) => (current === messageId ? null : current));
    return true;
  }, [replaceMessage, updateMessage]);

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
        nextState.visibleText.length + revealStep(backlog),
      );
      nextState.visibleText = nextState.fullText.slice(0, nextLength);
      for (const listener of nextState.listeners) {
        listener();
      }

      if (nextState.visibleText.length < nextState.fullText.length) {
        scheduleReveal(messageId);
      } else {
        commitFinishedStream(messageId, nextState);
      }
    });
  }, [commitFinishedStream]);

  const appendLocalUserMessage = useCallback((content: string, messageSceneId: string | null = null) => {
    appendMessage({
      companion_id: companionId,
      content,
      created_at: new Date().toISOString(),
      id: localMessageId('local-user'),
      role: 'user',
      scene_id: messageSceneId,
    });
  }, [appendMessage, companionId]);

  const appendStreamingCompanionMessage = useCallback((messageSceneId: string | null = null) => {
    const id = localMessageId('local-companion');
    const state = ensureState(id);
    state.commit = null;
    state.fullText = '';
    state.mode = 'local';
    state.visibleText = '';
    // The list row is a stable placeholder; its visible text comes from the
    // streaming store (subscribeStream), not from `content`, until the reply
    // finishes and we replace it with the final message.
    appendMessage({
      companion_id: companionId,
      content: '',
      created_at: new Date().toISOString(),
      id,
      role: 'companion',
      scene_id: messageSceneId,
    });
    setStreamingId(id);
    return id;
  }, [appendMessage, companionId, ensureState]);

  const beginStreamingExistingCompanionMessage = useCallback((messageId: string) => {
    const state = ensureState(messageId);
    if (state.rafId !== null) {
      cancelRevealFrame(state.rafId);
    }
    state.commit = null;
    state.fullText = '';
    state.mode = 'existing';
    state.rafId = null;
    state.visibleText = '';
    for (const listener of state.listeners) {
      listener();
    }
    setStreamingId(messageId);
  }, [ensureState]);

  const pushStreamingCompanionDelta = useCallback((messageId: string, delta: string) => {
    if (!delta) return;
    const state = streamsRef.current.get(messageId);
    if (!state) {
      updateMessage(messageId, (message) => ({ ...message, content: message.content + delta }));
      return;
    }
    state.fullText += delta;
    scheduleReveal(messageId);
  }, [scheduleReveal, updateMessage]);

  const finishStreamingMessage = useCallback((messageId: string, fullText: string, commit: StreamingCommit) => {
    const state = streamsRef.current.get(messageId);
    if (!state) {
      if (commit.kind === 'replace') {
        replaceMessage(messageId, commit.message);
      } else {
        updateMessage(messageId, commit.updater);
      }
      setStreamingId((current) => (current === messageId ? null : current));
      return;
    }

    state.fullText = fullText;
    if (state.visibleText.length > fullText.length || !fullText.startsWith(state.visibleText)) {
      state.visibleText = '';
      for (const listener of state.listeners) {
        listener();
      }
    }
    state.commit = commit;

    if (!commitFinishedStream(messageId, state)) {
      scheduleReveal(messageId);
    }
  }, [commitFinishedStream, replaceMessage, scheduleReveal, updateMessage]);

  const finishStreamingCompanionMessage = useCallback((
    messageId: string,
    result: { emotion: ChatEmotion | null; text: string },
    serverMessageId: string,
    messageSceneId: string | null,
  ) => {
    finishStreamingMessage(messageId, result.text, {
      kind: 'replace',
      message: {
        companion_id: companionId,
        content: result.text,
        created_at: new Date().toISOString(),
        emotion: result.emotion,
        id: serverMessageId || messageId,
        role: 'companion',
        scene_id: messageSceneId,
      },
    });
  }, [companionId, finishStreamingMessage]);

  const finishStreamingExistingCompanionMessage = useCallback((
    messageId: string,
    fullText: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    finishStreamingMessage(messageId, fullText, { kind: 'update', updater });
  }, [finishStreamingMessage]);

  const cleanupFailedStreamingCompanionMessage = useCallback((messageId: string, streamedText: string) => {
    const state = stopStreamingFrame(messageId);
    const text = streamedText || state?.fullText || state?.visibleText || '';
    setStreamingId((current) => (current === messageId ? null : current));
    if (state?.mode === 'existing') {
      return;
    }
    if (text.trim().length === 0) {
      removeMessage(messageId);
      return;
    }
    updateMessage(messageId, (message) => ({ ...message, content: text }));
  }, [removeMessage, stopStreamingFrame, updateMessage]);

  return {
    appendLocalUserMessage,
    appendStreamingCompanionMessage,
    beginStreamingExistingCompanionMessage,
    cleanupFailedStreamingCompanionMessage,
    finishStreamingCompanionMessage,
    finishStreamingExistingCompanionMessage,
    getStreamSnapshot,
    pushStreamingCompanionDelta,
    streamingId,
    subscribeStream,
  };
}
