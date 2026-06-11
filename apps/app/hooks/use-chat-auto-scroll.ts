import { useCallback, useRef, useState, type RefObject } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const AUTO_SCROLL_BOTTOM_THRESHOLD = 72;
const SCROLL_UP_EPSILON = 12;

export type ChatAutoScrollNotice =
  | { kind: 'moment'; label: string; messageId: string }
  | { kind: 'reply'; label: string; messageId?: undefined };

type ChatAutoScrollInput<T extends { id: string }> = {
  getItems: () => T[];
  listRef: RefObject<FlatList<T> | null>;
};

type ChatAutoScrollResult = {
  detachFromBottom: () => void;
  followBottom: (animated?: boolean) => void;
  handleContentSizeChange: () => void;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  jumpToBottom: () => void;
  jumpToMessage: (messageId: string) => void;
  notifyMomentReady: (messageId: string) => void;
  notifyNewReply: () => void;
  pendingNotice: ChatAutoScrollNotice | null;
  resetForThread: () => void;
};

function isNearBottom(event: NativeScrollEvent): boolean {
  const visibleBottom = event.contentOffset.y + event.layoutMeasurement.height;
  return event.contentSize.height - visibleBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD;
}

function runAfterLayout(fn: () => void) {
  globalThis.setTimeout(fn, 0);
}

export function useChatAutoScroll<T extends { id: string }>({
  getItems,
  listRef,
}: ChatAutoScrollInput<T>): ChatAutoScrollResult {
  const getItemsRef = useRef(getItems);
  const isFollowingBottomRef = useRef(true);
  const lastOffsetYRef = useRef(0);
  const pendingScrollRef = useRef(false);
  const [pendingNotice, setPendingNotice] = useState<ChatAutoScrollNotice | null>(null);
  getItemsRef.current = getItems;

  const scrollToBottom = useCallback((animated = false) => {
    const run = () => {
      runAfterLayout(() => {
        listRef.current?.scrollToEnd({ animated });
      });
    };
    if (animated) {
      run();
      return;
    }
    if (pendingScrollRef.current) {
      return;
    }
    pendingScrollRef.current = true;
    const raf = globalThis.requestAnimationFrame ?? ((cb: FrameRequestCallback) => globalThis.setTimeout(cb, 16));
    raf(() => {
      pendingScrollRef.current = false;
      run();
    });
  }, [listRef]);

  const followBottom = useCallback((animated = false) => {
    isFollowingBottomRef.current = true;
    setPendingNotice(null);
    scrollToBottom(animated);
  }, [scrollToBottom]);

  const jumpToBottom = useCallback(() => {
    followBottom(true);
  }, [followBottom]);

  const detachFromBottom = useCallback(() => {
    isFollowingBottomRef.current = false;
  }, []);

  const jumpToMessage = useCallback((messageId: string) => {
    const items = getItemsRef.current();
    const index = items.findIndex((item) => item.id === messageId);
    setPendingNotice(null);
    if (index < 0) {
      isFollowingBottomRef.current = true;
      scrollToBottom(true);
      return;
    }
    isFollowingBottomRef.current = false;
    runAfterLayout(() => {
      try {
        listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.35 });
      } catch {
        isFollowingBottomRef.current = true;
        scrollToBottom(true);
      }
    });
  }, [listRef, scrollToBottom]);

  const handleContentSizeChange = useCallback(() => {
    if (isFollowingBottomRef.current) {
      scrollToBottom(false);
    }
  }, [scrollToBottom]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    if (isNearBottom(event.nativeEvent)) {
      isFollowingBottomRef.current = true;
      setPendingNotice(null);
    } else if (y < lastOffsetYRef.current - SCROLL_UP_EPSILON) {
      isFollowingBottomRef.current = false;
    }
    lastOffsetYRef.current = y;
  }, []);

  const notifyNewReply = useCallback(() => {
    if (isFollowingBottomRef.current) {
      scrollToBottom(false);
      return;
    }
    setPendingNotice((current) => (
      current?.kind === 'reply' ? current : { kind: 'reply', label: 'New reply' }
    ));
  }, []);

  const notifyMomentReady = useCallback((messageId: string) => {
    if (isFollowingBottomRef.current) {
      scrollToBottom(false);
      return;
    }
    setPendingNotice((current) => current ?? { kind: 'moment', label: 'Moment image ready', messageId });
  }, []);

  const resetForThread = useCallback(() => {
    isFollowingBottomRef.current = true;
    lastOffsetYRef.current = 0;
    setPendingNotice(null);
    scrollToBottom(false);
  }, [scrollToBottom]);

  return {
    detachFromBottom,
    followBottom,
    handleContentSizeChange,
    handleScroll,
    jumpToBottom,
    jumpToMessage,
    notifyMomentReady,
    notifyNewReply,
    pendingNotice,
    resetForThread,
  };
}
