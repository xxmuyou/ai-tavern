import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SceneCompanionCard } from '@/components/SceneCompanionCard';
import { SceneDailyCompanion } from '@/components/SceneDailyCompanion';
import { TopBar } from '@/components/TopBar';
import { SCENES_ROUTE } from '@/constants/routes';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSceneEntry } from '@/hooks/use-scenes';

export default function SceneDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sceneId = Array.isArray(id) ? id[0] : id;
  const { pushError } = useErrorBanner();
  const { data, error, isLoading, refetch } = useSceneEntry(sceneId);

  useEffect(() => {
    const status = (error as Error & { status?: number } | null)?.status;
    if (status === 403) {
      pushError('This scene is still locked.');
      router.replace(SCENES_ROUTE);
    }
  }, [error, pushError, router]);

  if (isLoading) {
    return <LoadingScreen label="Entering scene..." />;
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title="Scene" />
        <EmptyState
          actionLabel="Try again"
          description="The scene could not be opened."
          onAction={refetch}
          title="Scene unavailable"
        />
      </View>
    );
  }

  const scene = data.scene;
  const imageSource = mediaSource(scene.art_url);
  const companions = data.companions_present;

  function openChat(companionId: string) {
    const params = new URLSearchParams({ sceneId: scene.id });
    if (scene.art_url) {
      params.set('sceneArt', scene.art_url);
    }
    router.push(`/chat/${encodeURIComponent(companionId)}?${params.toString()}` as Href);
  }

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showBack showQuota title={scene.name} />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-4xl gap-5 px-4 py-6">
          <View className="overflow-hidden rounded-lg border border-app-line bg-app-card">
            <View className="aspect-video w-full bg-app-primarySoft">
              {imageSource ? (
                <Image source={imageSource} resizeMode="cover" className="h-full w-full" />
              ) : (
                <View className="h-full w-full items-center justify-center bg-app-primarySoft">
                  <Text className="text-lg font-semibold text-app-primary">Scene artwork pending</Text>
                </View>
              )}
            </View>
            <View className="gap-3 p-5">
              <Text className="text-3xl font-semibold text-app-text">{scene.name}</Text>
              <Text className="text-base leading-6 text-app-muted">{scene.mood}</Text>
              {scene.tags.length ? (
                <View className="flex-row flex-wrap gap-2">
                  {scene.tags.map((tag) => (
                    <View key={tag} className="rounded-full bg-app-primarySoft px-3 py-1">
                      <Text className="text-xs font-semibold text-app-primary">{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <View>
            <Text className="mb-3 text-lg font-semibold text-app-text">Companions present</Text>
            {companions.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-3 pr-4">
                  {companions.map((companion) => (
                    <View key={companion.id} className="w-52">
                      <SceneCompanionCard
                        artUrl={companion.art_url}
                        name={companion.name}
                        opener={companion.opener}
                        onPress={() => {
                          if (companions.length > 1) {
                            openChat(companion.id);
                          } else {
                            router.push(`/companion/${encodeURIComponent(companion.id)}` as Href);
                          }
                        }}
                      />
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View className="rounded-lg border border-app-line bg-app-card p-5">
                <Text className="text-sm text-app-muted">No companions are present in this scene yet.</Text>
              </View>
            )}
          </View>

          {companions.length === 1 ? (
            <Button label={`Chat with ${companions[0].name}`} onPress={() => openChat(companions[0].id)} />
          ) : null}

          <View>
            <Text className="mb-3 text-lg font-semibold text-app-text">Today here</Text>
            {companions.length ? (
              <View className="gap-3">
                {companions.map((companion) => (
                  <SceneDailyCompanion
                    key={companion.id}
                    companion={companion}
                    sceneArt={scene.art_url}
                    sceneId={scene.id}
                  />
                ))}
              </View>
            ) : (
              <View className="rounded-lg border border-app-line bg-app-card p-5">
                <Text className="text-sm text-app-muted">No activity options are available in this scene yet.</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
