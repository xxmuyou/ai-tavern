import { Text, View } from 'react-native';

import type { ChatEmotion } from '@/hooks/use-chat-stream';

const EMOTION_EMOJI: Record<ChatEmotion, string> = {
  annoyed: '😤',
  guarded: '😶',
  neutral: '😐',
  playful: '😏',
  tense: '😟',
  warm: '😊',
};

type MessageBubbleProps = {
  content: string;
  emotion?: ChatEmotion | null;
  role: 'user' | 'companion' | 'assistant';
};

export function MessageBubble({ content, emotion, role }: MessageBubbleProps) {
  const isUser = role === 'user';
  const emoji = !isUser && emotion ? EMOTION_EMOJI[emotion] : null;

  return (
    <View className={`w-full flex-row px-4 py-1.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <View
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser ? 'rounded-tr-md bg-app-primary' : 'rounded-tl-md border border-app-line bg-app-card'
        }`}
      >
        {emoji ? (
          <Text className="mb-1 text-base" accessibilityLabel={`emotion ${emotion}`}>
            {emoji}
          </Text>
        ) : null}
        <Text
          selectable
          className={`text-base leading-6 ${isUser ? 'text-white' : 'text-app-text'}`}
        >
          {content}
        </Text>
      </View>
    </View>
  );
}
