import { useCallback, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import type { StreamSnapshot, StreamSubscribe } from '@/hooks/use-streaming-chat-messages';
import { hasRenderableStreamingText, StreamingBubble } from './StreamingBubble';
import { TypingBubble } from './MessageBubble';

type LiveStreamingBubbleProps = {
  messageId: string;
  subscribe: StreamSubscribe;
  getSnapshot: StreamSnapshot;
  companionName?: string | null;
};

const getServerSnapshot = () => '';

/**
 * The in-flight companion reply. It subscribes to the streaming store directly
 * via useSyncExternalStore, so each token re-renders only this leaf — never the
 * chat screen or the message list.
 *
 * It renders through the same narration formatting as the finished MessageBubble
 * (via StreamingBubble) so the layout/height matches exactly: when streaming ends
 * and the list swaps in the final bubble there is no reflow, hence no scroll jump.
 */
export function LiveStreamingBubble({ messageId, subscribe, getSnapshot, companionName }: LiveStreamingBubbleProps) {
  const text = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribe(messageId, onChange), [subscribe, messageId]),
    useCallback(() => getSnapshot(messageId), [getSnapshot, messageId]),
    getServerSnapshot,
  );

  if (text.length === 0 || !hasRenderableStreamingText(text)) {
    return (
      <View className="w-full py-1">
        <TypingBubble />
      </View>
    );
  }

  return <StreamingBubble text={text} companionName={companionName} />;
}
