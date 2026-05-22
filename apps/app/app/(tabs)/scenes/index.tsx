import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SceneCard } from '@/components/SceneCard';
import { TopBar } from '@/components/TopBar';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useScenes } from '@/hooks/use-scenes';

export default function ScenesScreen() {
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const { data, error, isLoading, refetch } = useScenes();

  function openScene(sceneId: string) {
    router.push(`/scene/${encodeURIComponent(sceneId)}` as Href);
  }

  if (isLoading) {
    return <LoadingScreen label="Loading scenes..." />;
  }

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showQuota title="Scenes" />
      {error ? (
        <EmptyState
          actionLabel="Try again"
          description="Scene data could not be loaded."
          onAction={refetch}
          title="Scenes are unavailable"
        />
      ) : !data?.scenes.length ? (
        <EmptyState
          actionLabel="Refresh"
          description="No scenes are active yet. Add scene seed data in the API to populate this list."
          onAction={refetch}
          title="No scenes yet"
        />
      ) : (
        <ScrollView className="flex-1">
          <View className="mx-auto w-full max-w-4xl gap-4 px-4 py-6">
            {data.scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                onPress={() => {
                  if (!scene.unlocked) {
                    pushError(typeof scene.unlock_hint === 'string' ? scene.unlock_hint : 'This scene is still locked.');
                    return;
                  }
                  openScene(scene.id);
                }}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
