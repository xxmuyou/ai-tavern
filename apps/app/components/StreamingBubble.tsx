import { useMemo } from 'react';
import { View } from 'react-native';

import { normalizeChatDisplayText, normalizeCompanionNarrationPerspective, parseNarration } from '@/utils/narration';
import { DialogueBubble, NarrationLine } from './MessageBubble';

type StreamingBubbleProps = {
  text: string;
  companionName?: string | null;
};

function streamingSegments(text: string) {
  // Hide a trailing, not-yet-complete tag (e.g. text streamed up to `<narr`,
  // or a stall mid-tag) so the literal `<...` never flashes in the bubble. Once
  // the closing `>` arrives parseNarration strips the whole tag as usual.
  const withoutPartialTag = normalizeChatDisplayText(text).replace(/<[^>]*$/, '');
  return parseNarration(withoutPartialTag, { tolerateUnclosed: true });
}

export function hasRenderableStreamingText(text: string): boolean {
  return streamingSegments(text).length > 0;
}

export function StreamingBubble({ text, companionName }: StreamingBubbleProps) {
  const segments = useMemo(() => streamingSegments(text), [text]);

  if (text.length === 0 || segments.length === 0) {
    return null;
  }

  return (
    <View className="w-full py-1">
      {segments.map((segment, idx) => {
        const isLast = idx === segments.length - 1;
        if (segment.type === 'narration') {
          return (
            <NarrationLine
              key={`narration-${idx}`}
              text={normalizeCompanionNarrationPerspective(segment.text, companionName)}
              trailingCursor={isLast}
            />
          );
        }
        return (
          <DialogueBubble
            key={`dialogue-${idx}`}
            role="companion"
            text={segment.text}
            trailingCursor={isLast}
          />
        );
      })}
    </View>
  );
}
