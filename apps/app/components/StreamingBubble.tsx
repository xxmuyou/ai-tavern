import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

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

  const isThinking = text.length === 0;

  return (
    <View className="w-full flex-row justify-start px-4 py-1.5">
      <View className="max-w-[80%] rounded-2xl rounded-tl-md border border-app-line bg-app-card px-4 py-2.5">
        {isThinking ? (
          <Text className="text-base leading-6 text-app-muted">{`Thinking${DOT_FRAMES[frame]}`}</Text>
        ) : (
          <Text className="text-base leading-6 text-app-text">
            {text}
            <Text className="text-app-muted">{'▊'}</Text>
          </Text>
        )}
      </View>
    </View>
  );
}
