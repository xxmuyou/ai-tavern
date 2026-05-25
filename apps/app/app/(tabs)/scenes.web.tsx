import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { Scene } from '@/api/types';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { WebAppShell } from '@/components/web/WebAppShell';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useScenes } from '@/hooks/use-scenes';

export default function WebScenesScreen() {
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const { data, error, isLoading, refetch } = useScenes();

  if (isLoading) {
    return <LoadingScreen label="Loading scenes..." />;
  }

  return (
    <WebAppShell title="Scenes" subtitle="Browse locations, unlock paths, and choose where the next conversation begins.">
      {error ? (
        <EmptyState actionLabel="Try again" description="Scene data could not be loaded." onAction={refetch} title="Scenes are unavailable" />
      ) : !data?.scenes.length ? (
        <EmptyState actionLabel="Refresh" description="No scenes are active yet." onAction={refetch} title="No scenes yet" />
      ) : (
        <View className="flex-row flex-wrap gap-5">
          {data.scenes.map((scene) => (
            <SceneTile
              key={scene.id}
              scene={scene}
              onPress={() => {
                if (!scene.unlocked) {
                  pushError(formatUnlockHint(scene.unlock_hint) || 'This scene is still locked.');
                  return;
                }
                router.push(`/scene/${encodeURIComponent(scene.id)}` as Href);
              }}
            />
          ))}
        </View>
      )}
    </WebAppShell>
  );
}

function SceneTile({ onPress, scene }: { onPress: () => void; scene: Scene }) {
  const imageSource = mediaSource(scene.art_url);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="min-w-[300px] flex-1 overflow-hidden rounded-lg border border-app-line bg-white">
      <View className="aspect-video bg-app-primarySoft">
        {imageSource ? <Image source={imageSource} resizeMode="cover" className="h-full w-full" /> : null}
        {!scene.unlocked ? (
          <View className="absolute right-3 top-3 rounded-full bg-app-text px-3 py-1">
            <Text className="text-xs font-semibold text-white">Locked</Text>
          </View>
        ) : null}
      </View>
      <View className="gap-3 p-5">
        <View>
          <Text className="text-2xl font-semibold text-app-text">{scene.name}</Text>
          <Text className="mt-2 text-sm leading-6 text-app-muted">{scene.mood}</Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {scene.tags.slice(0, 4).map((tag) => (
            <View key={tag} className="rounded-full bg-app-primarySoft px-3 py-1">
              <Text className="text-xs font-semibold text-app-primary">{tag}</Text>
            </View>
          ))}
        </View>
        <Text className="text-sm text-app-muted">
          {scene.unlocked ? `${scene.potential_companions.length} companions nearby` : formatUnlockHint(scene.unlock_hint)}
        </Text>
      </View>
    </Pressable>
  );
}

function formatUnlockHint(hint: Scene['unlock_hint']): string {
  if (!hint) return '';
  if (typeof hint === 'string') return hint;
  const subject = hint.label ?? hint.companion_id ?? 'a companion';
  const dimension = hint.dimension ? hint.dimension.replace(/_/g, ' ') : 'relationship';
  return `Requires ${subject} ${dimension} >= ${hint.value ?? 0}`;
}
