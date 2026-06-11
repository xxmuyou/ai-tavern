import { View } from 'react-native';

import { normalizeCompanionNarrationPerspective, parseNarration } from '@/utils/narration';
import { DialogueBubble, NarrationLine } from './MessageBubble';

type StreamingBubbleProps = {
  text: string;
  companionName?: string | null;
};

export function StreamingBubble({ text, companionName }: StreamingBubbleProps) {
  if (text.length === 0) {
    return null;
  }

  const segments = parseNarration(text, { tolerateUnclosed: true });

  return (
    <View className="w-full py-1">
      {segments.map((segment, idx) => {
        const isLast = idx === segments.length - 1;
        if (segment.type === 'narration') {
          return (
            <NarrationLine
              key={idx}
              text={normalizeCompanionNarrationPerspective(segment.text, companionName)}
              trailingCursor={isLast}
            />
          );
        }
        return (
          <DialogueBubble
            key={idx}
            role="companion"
            text={segment.text}
            trailingCursor={isLast}
          />
        );
      })}
    </View>
  );
}
