import { Pressable, Text, View } from 'react-native';

export function RelationshipPacingTip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View className="flex-row items-start gap-3 border-b border-app-line bg-app-primarySoft px-4 py-3 web:border-white/10 web:bg-app-solid-panel">
      <View className="flex-1 gap-1">
        <Text className="text-sm font-semibold text-app-primary web:text-app-rose">Relationships take time</Text>
        <Text className="text-xs leading-5 text-app-text web:text-white/75">
          Companions open up over time. Scenes, stories, memories, and private details unlock as your relationship develops.
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Dismiss relationship pacing tip"
        accessibilityRole="button"
        onPress={onDismiss}
        className="h-7 w-7 items-center justify-center rounded-full bg-app-card web:bg-white/10"
      >
        <Text className="text-base font-semibold text-app-muted web:text-white/70">x</Text>
      </Pressable>
    </View>
  );
}
