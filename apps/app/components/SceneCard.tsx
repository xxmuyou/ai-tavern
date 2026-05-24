import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { Scene } from '@/api/types';

type SceneCardProps = {
  onPress: () => void;
  scene: Scene;
};

export function SceneCard({ onPress, scene }: SceneCardProps) {
  const imageSource = mediaSource(scene.art_url);
  const hint = formatUnlockHint(scene.unlock_hint);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="overflow-hidden rounded-lg border border-app-line bg-app-card">
      <View className="h-48 bg-app-primarySoft">
        {imageSource ? (
          <Image source={imageSource} resizeMode="cover" className="h-full w-full" />
        ) : (
          <View className="h-full w-full items-center justify-center bg-app-primarySoft">
            <Ionicons color="#1E6B52" name="map-outline" size={40} />
          </View>
        )}
        {!scene.unlocked ? (
          <View className="absolute right-3 top-3 flex-row items-center gap-1 rounded-full bg-app-text px-3 py-1">
            <Ionicons color="#FFFFFF" name="lock-closed" size={14} />
            <Text className="text-xs font-semibold text-white">Locked</Text>
          </View>
        ) : null}
      </View>

      <View className="gap-3 p-4">
        <View>
          <Text className="text-xl font-semibold text-app-text">{scene.name}</Text>
          <Text className="mt-1 text-sm leading-5 text-app-muted">{scene.mood}</Text>
        </View>

        {scene.tags.length ? (
          <View className="flex-row flex-wrap gap-2">
            {scene.tags.slice(0, 4).map((tag) => (
              <View key={tag} className="rounded-full bg-app-primarySoft px-3 py-1">
                <Text className="text-xs font-semibold text-app-primary">{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {!scene.unlocked && hint ? (
          <Text className="text-sm font-medium text-app-warning">{hint}</Text>
        ) : scene.potential_companions.length ? (
          <Text className="text-sm text-app-muted">
            {scene.potential_companions.length} companion{scene.potential_companions.length === 1 ? '' : 's'} nearby
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function formatUnlockHint(hint: Scene['unlock_hint']): string {
  if (!hint) {
    return '';
  }
  if (typeof hint === 'string') {
    return hint;
  }

  const subject = hint.label ?? hint.companion_id ?? 'a companion';
  const dimension = hint.dimension ? hint.dimension.replace(/_/g, ' ') : 'relationship';
  const value = typeof hint.value === 'number' ? hint.value : 0;
  return `Requires ${subject} ${dimension} >= ${value}`;
}
