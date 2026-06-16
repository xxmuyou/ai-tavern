import { Pressable, Text, View } from 'react-native';

import type { ChatMode } from '@/api/types';

type ChatModeSwitchProps = {
  compact?: boolean;
  disabled?: boolean;
  mode: ChatMode;
  noStoryHint?: boolean;
  onChange: (mode: ChatMode) => void;
  relationshipBoostHint?: string | null;
  showHints?: boolean;
};

const OPTIONS: { label: string; mode: ChatMode }[] = [
  { label: 'Talk', mode: 'talk' },
  { label: 'Story', mode: 'story' },
];

export function ChatModeSwitch({
  compact = false,
  disabled = false,
  mode,
  noStoryHint = false,
  onChange,
  relationshipBoostHint = null,
  showHints = true,
}: ChatModeSwitchProps) {
  return (
    <View className={compact ? 'gap-0' : 'gap-1'}>
      <View className={`flex-row self-start rounded-full border border-app-line bg-app-sunken ${compact ? 'p-0.5' : 'p-1'}`}>
        {OPTIONS.map((option) => {
          const selected = mode === option.mode;
          return (
            <Pressable
              key={option.mode}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              onPress={() => onChange(option.mode)}
              className={`${compact ? 'min-w-[46px] px-1.5 py-1' : 'min-w-[68px] px-3 py-1.5'} rounded-full ${selected ? 'bg-app-primary' : 'bg-transparent'}`}
            >
              <Text className={`text-center ${compact ? 'text-[10px]' : 'text-xs'} font-semibold ${selected ? 'text-white' : 'text-app-muted'}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {showHints && noStoryHint ? (
        <Text className="text-xs text-app-muted">No story here yet.</Text>
      ) : null}
      {showHints && relationshipBoostHint ? (
        <Text className="text-xs font-medium text-app-primary">{relationshipBoostHint}</Text>
      ) : null}
    </View>
  );
}
