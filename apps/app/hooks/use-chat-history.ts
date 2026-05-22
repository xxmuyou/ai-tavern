import { useCallback, useEffect, useRef, useState } from 'react';

import { getChatHistory } from '@/api/companion-client';
import type { ChatMessage } from '@/api/types';

const PAGE_SIZE = 30;

export type UseChatHistoryResult = {
  appendMessage: (message: ChatMessage) => void;
  error: Error | null;
  hasMore: boolean;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
  messages: ChatMessage[];
  refresh: () => Promise<void>;
  replaceMessage: (id: string, next: ChatMessage) => void;
  reset: () => void;
};

export function useChatHistory(companionId: string): UseChatHistoryResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoadingInitial(true);
    setError(null);
    try {
      const response = await getChatHistory(companionId, { limit: PAGE_SIZE });
      if (!isMountedRef.current) {
        return;
      }
      setMessages(response.messages);
      setHasMore(response.next_cursor !== null);
    } catch (nextError) {
      if (isMountedRef.current) {
        setError(nextError instanceof Error ? nextError : new Error('Failed to load history.'));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingInitial(false);
      }
    }
  }, [companionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const response = await getChatHistory(companionId, {
        beforeId: messages[0].id,
        limit: PAGE_SIZE,
      });
      if (!isMountedRef.current) {
        return;
      }
      setMessages((current) => [...response.messages, ...current]);
      setHasMore(response.next_cursor !== null);
    } catch (nextError) {
      if (isMountedRef.current) {
        setError(nextError instanceof Error ? nextError : new Error('Failed to load more messages.'));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingMore(false);
      }
    }
  }, [companionId, hasMore, isLoadingMore, messages]);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => [...current, message]);
  }, []);

  const replaceMessage = useCallback((id: string, next: ChatMessage) => {
    setMessages((current) => current.map((message) => (message.id === id ? next : message)));
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setHasMore(false);
    setError(null);
  }, []);

  return {
    appendMessage,
    error,
    hasMore,
    isLoadingInitial,
    isLoadingMore,
    loadMore,
    messages,
    refresh,
    replaceMessage,
    reset,
  };
}
