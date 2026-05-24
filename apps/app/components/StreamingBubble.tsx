import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { parseNarration } from '@/utils/narration';

type StreamingBubbleProps = {
  text: string;
};

const DOT_FRAMES = ['.', '..', '...'];

export function StreamingBubble({ text }: StreamingBubbleProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (text.length > 0) {
      return;
    }
    const id = globalThis.setInterval(() => {
      setFrame((current) => (current + 1) % DOT_FRAMES.length);
    }, 400);
    return () => globalThis.clearInterval(id);
  }, [text.length]);

  if (text.length === 0) {
    return (
      <View className="w-full flex-row justify-start px-4 py-1.5">
        <View className="max-w-[80%] rounded-2xl rounded-tl-md border border-app-line bg-app-card px-4 py-2.5">
          <Text className="text-base leading-6 text-app-muted">{`Thinking${DOT_FRAMES[frame]}`}</Text>
        </View>
      </View>
    );
  }

  const segments = parseNarration(text, { tolerateUnclosed: true });

  return (
    <View className="w-full px-4 py-1.5">
      <View className="max-w-[80%] self-start">
        {segments.map((segment, idx) => {
          const isLast = idx === segments.length - 1;
          if (segment.type === 'narration') {
            return (
              <Text
                key={idx}
                className="mb-1 px-1 text-sm italic leading-5 text-app-muted"
              >
                {segment.text}
                {isLast ? <Text className="text-app-muted">{'▊'}</Text> : null}
              </Text>
            );
          }
          return (
            <View
              key={idx}
              className="mb-1 rounded-2xl rounded-tl-md border border-app-line bg-app-card px-4 py-2.5"
            >
              <Text className="text-base leading-6 text-app-text">
                {segment.text}
                {isLast ? <Text className="text-app-muted">{'▊'}</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
