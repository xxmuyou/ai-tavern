import { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { normalizeChatDisplayText, normalizeCompanionNarrationPerspective, parseNarration } from '@/utils/narration';

type MessageBubbleProps = {
  content: string;
  isPending?: boolean;
  isStreaming?: boolean;
  role: 'user' | 'companion' | 'assistant';
  companionName?: string | null;
};

export const MessageBubble = memo(function MessageBubble({
  content,
  isPending = false,
  isStreaming = false,
  role,
  companionName,
}: MessageBubbleProps) {
  const isUser = role === 'user';
  const segments = parseNarration(normalizeChatDisplayText(content), { tolerateUnclosed: isStreaming });

  if (segments.length === 0) {
    if (isPending && !isUser) {
      return (
        <View className="w-full py-1">
          <TypingBubble />
        </View>
      );
    }
    return null;
  }

  if (isUser) {
    return (
      <View className="w-full py-1">
        {segments.map((segment, idx) => (
          segment.type === 'narration' ? (
            <NarrationLine key={idx} text={segment.text} trailingCursor={isStreaming && idx === segments.length - 1} />
          ) : (
            <DialogueBubble key={idx} text={segment.text} role="user" trailingCursor={isStreaming && idx === segments.length - 1} />
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
            trailingCursor={isStreaming && idx === segments.length - 1}
          />
        ) : (
          <DialogueBubble key={idx} text={segment.text} role="companion" trailingCursor={isStreaming && idx === segments.length - 1} />
        )
      ))}
    </View>
  );
});

export function TypingBubble() {
  return (
    <View className="w-full flex-row justify-start px-4 py-0.5">
      <View className="rounded-2xl rounded-tl-md border border-app-line bg-app-card px-4 py-3">
        <View className="flex-row items-center gap-1.5">
          <View className="h-1.5 w-1.5 rounded-full bg-app-muted" />
          <View className="h-1.5 w-1.5 rounded-full bg-app-muted" />
          <View className="h-1.5 w-1.5 rounded-full bg-app-muted" />
        </View>
      </View>
    </View>
  );
}

export function NarrationLine({ text, trailingCursor }: { text: string; trailingCursor?: boolean }) {
  return (
    <View className="min-w-0 w-full items-center px-4 py-1">
      <Text
        selectable
        className="min-w-0 max-w-[88%] shrink text-center text-sm italic leading-5 text-app-muted"
        style={styles.wrappingText}
      >
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
    <View className={`min-w-0 w-full flex-row px-4 py-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <View
        className={`min-w-0 max-w-[80%] shrink rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'rounded-tr-md bg-app-primary'
            : 'rounded-tl-md border border-app-line bg-app-card'
        }`}
        style={styles.dialogueBubble}
      >
        <Text
          selectable
          className={`min-w-0 shrink text-base leading-6 ${isUser ? 'text-white' : 'text-app-text'}`}
          style={styles.wrappingText}
        >
          {text}
          {trailingCursor ? <Text className="text-app-muted">{'▊'}</Text> : null}
        </Text>
      </View>
    </View>
  );
}

const webWrappingText = Platform.OS === 'web'
  ? {
      overflowWrap: 'anywhere',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }
  : null;

const styles = StyleSheet.create({
  dialogueBubble: {
    flexShrink: 1,
    maxWidth: '80%',
    minWidth: 0,
  },
  wrappingText: {
    flexShrink: 1,
    minWidth: 0,
    ...(webWrappingText as object),
  },
});
