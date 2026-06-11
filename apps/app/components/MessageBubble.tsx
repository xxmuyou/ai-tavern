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
      <View className="w-full py-1">
        {segments.map((segment, idx) => (
          segment.type === 'narration' ? (
            <NarrationLine key={idx} text={segment.text} />
          ) : (
            <DialogueBubble key={idx} text={segment.text} role="user" />
          )
        ))}
      </View>
    );
  }

  return (
    <View className="w-full py-1">
      {segments.map((segment, idx) => (
        segment.type === 'narration' ? (
          <NarrationLine
            key={idx}
            text={normalizeCompanionNarrationPerspective(segment.text, companionName)}
          />
        ) : (
          <DialogueBubble key={idx} text={segment.text} role="companion" />
        )
      ))}
    </View>
  );
}

export function NarrationLine({ text, trailingCursor }: { text: string; trailingCursor?: boolean }) {
  return (
    <View className="w-full items-center px-4 py-1">
      <Text selectable className="max-w-[88%] text-center text-sm italic leading-5 text-app-muted">
        {text}
        {trailingCursor ? <Text className="text-app-muted">{'▊'}</Text> : null}
      </Text>
    </View>
  );
}

export function DialogueBubble({
  role,
  text,
  trailingCursor,
}: {
  role: 'user' | 'companion';
  text: string;
  trailingCursor?: boolean;
}) {
  const isUser = role === 'user';
  return (
    <View className={`w-full flex-row px-4 py-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <View
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'rounded-tr-md bg-app-primary'
            : 'rounded-tl-md border border-app-line bg-app-card'
        }`}
      >
        <Text selectable className={`text-base leading-6 ${isUser ? 'text-white' : 'text-app-text'}`}>
          {text}
          {trailingCursor ? <Text className="text-app-muted">{'▊'}</Text> : null}
        </Text>
      </View>
    </View>
  );
}
