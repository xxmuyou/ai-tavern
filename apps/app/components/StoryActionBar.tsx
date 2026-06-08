import { Pressable, Text, View } from 'react-native';

import type { StoryChoice, StoryMoment } from '@/api/types';

type StoryActionBarProps = {
  disabled?: boolean;
  moment: StoryMoment | null;
  onSelect: (choice: StoryChoice) => void;
};

export function StoryActionBar({ disabled = false, moment, onSelect }: StoryActionBarProps) {
  if (!moment || moment.choices.length === 0) return null;
  const primary = moment.choices[0];
  const secondary = moment.choices.slice(1, 3);

  return (
    <View className="border-t border-app-line bg-app-card px-4 py-3">
      <Text className="text-xs font-semibold uppercase text-app-primary">Story objective</Text>
      <Text className="mt-1 text-sm leading-5 text-app-muted">{moment.objective}</Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        <StoryChoiceButton choice={primary} disabled={disabled} primary onPress={onSelect} />
        {secondary.map((choice) => (
          <StoryChoiceButton key={choice.id} choice={choice} disabled={disabled} onPress={onSelect} />
        ))}
      </View>
    </View>
  );
}

function StoryChoiceButton({
  choice,
  disabled,
  onPress,
  primary = false,
}: {
  choice: StoryChoice;
  disabled: boolean;
  onPress: (choice: StoryChoice) => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => onPress(choice)}
      className={`rounded-full border px-3 py-2 ${
        primary ? 'border-app-primary bg-app-primary' : 'border-app-line bg-app-bg'
      } ${disabled ? 'opacity-50' : 'opacity-100'}`}
    >
      <Text className={`text-xs font-semibold ${primary ? 'text-white' : 'text-app-text'}`}>
        {choice.label}
      </Text>
    </Pressable>
  );
}
