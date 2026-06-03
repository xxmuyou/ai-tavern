import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

type MessageActionsProps = {
  variants?: string[] | null;
  selectedVariant?: number | null;
  isRegenerating: boolean;
  isSpeaking?: boolean;
  disabled?: boolean;
  onRegenerate: () => void;
  onSelectVariant: (index: number) => void;
  onSpeak?: () => void;
};

/**
 * Per-reply controls under a companion bubble: regenerate, and (when more than
 * one wording exists) swipe between stored variants.
 */
export function MessageActions({
  variants,
  selectedVariant,
  isRegenerating,
  isSpeaking,
  disabled,
  onRegenerate,
  onSelectVariant,
  onSpeak,
}: MessageActionsProps) {
  const count = variants?.length ?? 0;
  const hasVariants = count > 1;
  const current = typeof selectedVariant === 'number' ? selectedVariant : count - 1;

  return (
    <View className="flex-row items-center gap-3 px-5 pb-1.5">
      {hasVariants ? (
        <View className="flex-row items-center gap-1.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous version"
            disabled={disabled || isRegenerating || current <= 0}
            onPress={() => onSelectVariant(current - 1)}
            className={current <= 0 ? 'opacity-30' : 'opacity-100'}
          >
            <Text className="text-sm font-semibold text-app-muted">‹</Text>
          </Pressable>
          <Text className="text-xs text-app-muted">
            {current + 1}/{count}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next version"
            disabled={disabled || isRegenerating || current >= count - 1}
            onPress={() => onSelectVariant(current + 1)}
            className={current >= count - 1 ? 'opacity-30' : 'opacity-100'}
          >
            <Text className="text-sm font-semibold text-app-muted">›</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Regenerate reply"
        disabled={disabled || isRegenerating}
        onPress={onRegenerate}
        className="flex-row items-center gap-1"
      >
        {isRegenerating ? (
          <ActivityIndicator size="small" />
        ) : (
          <Text className={`text-xs font-semibold ${disabled ? 'text-app-muted/50' : 'text-app-primary'}`}>
            ↻ Regenerate
          </Text>
        )}
      </Pressable>

      {onSpeak ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play voice"
          disabled={disabled || isSpeaking}
          onPress={onSpeak}
          className="flex-row items-center gap-1"
        >
          {isSpeaking ? (
            <ActivityIndicator size="small" />
          ) : (
            <Ionicons color={disabled ? '#B0B4B8' : '#6E59C7'} name="volume-medium-outline" size={16} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
