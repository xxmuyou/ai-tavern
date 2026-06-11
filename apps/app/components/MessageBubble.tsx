import { Text, View } from 'react-native';

import { normalizeCompanionNarrationPerspective, parseNarration } from '@/utils/narration';

type MessageBubbleProps = {
  content: string;
  role: 'user' | 'companion' | 'assistant';
  companionName?: string | null;
};

export function MessageBubble({ content, role, companionName }: MessageBubbleProps) {
  const isUser = role === 'user';
  const segments = parseNarration(content);

  if (segments.length === 0) {
    return null;
  }

  if (isUser) {
    return (
      <View className="w-full flex-row justify-end px-4 py-1.5">
        <View className="max-w-[80%] items-end">
          {segments.map((segment, idx) => {
            if (segment.type === 'narration') {
              return (
                <Text
                  key={idx}
                  selectable
                  className="mb-1 px-1 text-right text-sm italic leading-5 text-app-muted"
                >
                  {segment.text}
                </Text>
              );
            }
            return (
              <View
                key={idx}
                className="mb-1 rounded-2xl rounded-tr-md bg-app-primary px-4 py-2.5"
              >
                <Text selectable className="text-base leading-6 text-white">
                  {segment.text}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View className="w-full px-4 py-1.5">
      <View className="max-w-[80%] self-start">
        {segments.map((segment, idx) => {
          if (segment.type === 'narration') {
            const text = normalizeCompanionNarrationPerspective(segment.text, companionName);
            return (
              <Text
                key={idx}
                selectable
                className="mb-1 px-1 text-sm italic leading-5 text-app-muted"
              >
                {text}
              </Text>
            );
          }
          return (
            <View
              key={idx}
              className="mb-1 rounded-2xl rounded-tl-md border border-app-line bg-app-card px-4 py-2.5"
            >
              <Text selectable className="text-base leading-6 text-app-text">
                {segment.text}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
