import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SceneDailyCompanion } from '@/components/SceneDailyCompanion';
import { WebAppShell, WebPanel } from '@/components/web/WebAppShell';
import { SCENES_ROUTE } from '@/constants/routes';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSceneEntry } from '@/hooks/use-scenes';

export default function WebSceneDetailScreen() {
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
      <WebAppShell title="Scene" subtitle="This scene could not be opened.">
        <EmptyState actionLabel="Try again" description="The scene could not be opened." onAction={refetch} title="Scene unavailable" />
      </WebAppShell>
    );
  }

  const scene = data.scene;
  const imageSource = mediaSource(scene.art_url);

  function openChat(companionId: string) {
    const params = new URLSearchParams({ sceneId: scene.id });
    if (scene.art_url) params.set('sceneArt', scene.art_url);
    router.push(`/chat/${encodeURIComponent(companionId)}?${params.toString()}` as Href);
  }

  return (
    <WebAppShell title={scene.name} subtitle={scene.mood}>
      <View className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <View className="overflow-hidden rounded-lg border border-app-line bg-white xl:col-span-2">
          <View className="aspect-video bg-app-primarySoft">
            {imageSource ? <Image source={imageSource} resizeMode="cover" className="h-full w-full" /> : null}
          </View>
          <View className="p-6">
            <View className="flex-row flex-wrap gap-2">
              {scene.tags.map((tag) => (
                <View key={tag} className="rounded-full bg-app-primarySoft px-3 py-1">
                  <Text className="text-xs font-semibold text-app-primary">{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <WebPanel>
          <Text className="text-xl font-semibold text-app-text">Companions present</Text>
          <View className="mt-5 gap-3">
            {data.companions_present.length ? (
              data.companions_present.map((companion) => {
                const portrait = mediaSource(companion.art_url);
                return (
                  <Pressable
                    key={companion.id}
                    accessibilityRole="button"
                    onPress={() => openChat(companion.id)}
                    className="flex-row items-center gap-4 rounded-lg border border-app-line bg-app-bg p-3"
                  >
                    <View className="h-16 w-16 items-center justify-end overflow-hidden rounded-md bg-app-primarySoft">
                      {portrait ? <Image source={portrait} resizeMode="contain" className="h-[112%] w-[112%]" /> : null}
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-semibold text-app-text">{companion.name}</Text>
                      {companion.active_story_beat ? (
                        <Text numberOfLines={1} className="mt-1 text-xs font-semibold text-app-primary">
                          {companion.active_story_beat.status === 'waiting_stage'
                            ? `Reach ${prettyStage(companion.active_story_beat.stage_gate)}`
                            : companion.active_story_beat.title}
                        </Text>
                      ) : null}
                      <Text numberOfLines={2} className="mt-1 text-sm text-app-muted">{companion.opener}</Text>
                      {companion.active_story_beat?.objective ? (
                        <Text numberOfLines={2} className="mt-1 text-xs text-app-muted">
                          {companion.active_story_beat.objective}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            ) : (
              <Text className="text-sm text-app-muted">No companions are present in this scene yet.</Text>
            )}
          </View>
        </WebPanel>
      </View>

      <View className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {data.companions_present.map((companion) => (
          <SceneDailyCompanion key={companion.id} companion={companion} sceneArt={scene.art_url} sceneId={scene.id} />
        ))}
      </View>
    </WebAppShell>
  );
}

function prettyStage(stage: string): string {
  return stage
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
