import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import { WebAppShell } from '@/components/web/WebAppShell';
import { SceneDailyCompanion } from '@/components/SceneDailyCompanion';
import {
  WebButton,
  WebCard,
  WebEmptyState,
  WebLoading,
  WebTag,
} from '@/components/web/ui';
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
    return <WebLoading label="Stepping inside..." />;
  }

  if (error || !data) {
    return (
      <WebAppShell
        title="Scene"
        subtitle="This scene could not be opened."
        breadcrumbs={[{ href: SCENES_ROUTE, label: 'Scenes' }]}
      >
        <WebEmptyState
          actionLabel="Try again"
          description="The scene could not be opened."
          onAction={refetch}
          title="Scene unavailable"
        />
      </WebAppShell>
    );
  }

  const scene = data.scene;
  const imageSource = mediaSource(scene.art_url);
  const companions = data.companions_present;

  function openChat(companionId: string) {
    const params = new URLSearchParams({ sceneId: scene.id });
    if (scene.art_url) params.set('sceneArt', scene.art_url);
    router.push(`/chat/${encodeURIComponent(companionId)}?${params.toString()}` as Href);
  }

  return (
    <WebAppShell
      title={scene.name}
      subtitle={scene.mood}
      breadcrumbs={[{ href: SCENES_ROUTE, label: 'Scenes' }, { label: scene.name }]}
    >
      <View className="grid grid-cols-1 gap-8 xl:grid-cols-[1.4fr_1fr]">
        {/* Hero card */}
        <WebCard padding="none" className="overflow-hidden">
          <View className="relative aspect-[16/9] w-full overflow-hidden bg-app-sunken">
            {imageSource ? (
              <Image source={imageSource} resizeMode="cover" className="h-full w-full" />
            ) : (
              <View className="h-full w-full items-center justify-center bg-gradient-warm">
                <Text className="font-serif text-display-lg text-rose-deep/40">{scene.name.slice(0, 1)}</Text>
              </View>
            )}
            <View className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-app-twilight/70 to-transparent" />
            <View className="absolute left-7 right-7 bottom-6 flex-row items-center justify-between">
              <View className="flex-row flex-wrap gap-1.5">
                {scene.tags.map((tag) => (
                  <WebTag key={tag} size="sm" variant="rose" className="bg-white/90">
                    {tag}
                  </WebTag>
                ))}
              </View>
              <View className="rounded-full bg-white/90 px-3 py-1">
                <Text className="text-caption font-semibold text-app-ink">
                  {companions.length} here
                </Text>
              </View>
            </View>
          </View>
          <View className="gap-5 p-7">
            <View>
              <Text className="text-overline text-rose-deep">A place to be</Text>
              <Text className="mt-2 font-serif text-title text-app-ink">"{scene.mood}"</Text>
            </View>
            <Text className="text-body-sm leading-7 text-app-ink-soft">
              Step into the room and see who is already here. The conversation will start where it wants to start — your move is to show up.
            </Text>
          </View>
        </WebCard>

        {/* Companions present */}
        <WebCard padding="lg" className="gap-5">
          <View>
            <Text className="text-overline text-rose-deep">In the room</Text>
            <Text className="mt-1 font-serif text-title text-app-ink">Companions present</Text>
          </View>
          {companions.length === 0 ? (
            <Text className="text-body-sm text-app-muted">No companions are present in this scene yet.</Text>
          ) : (
            <View className="gap-3">
              {companions.map((companion) => {
                const portrait = mediaSource(companion.art_url);
                return (
                  <Pressable
                    key={companion.id}
                    accessibilityRole="link"
                    onPress={() => openChat(companion.id)}
                    className="group flex-row items-center gap-4 rounded-2xl border border-app-line bg-app-surface p-3 transition-colors hover:border-rose/40"
                  >
                    <View className="h-16 w-16 items-center justify-end overflow-hidden rounded-xl bg-rose-soft">
                      {portrait ? (
                        <Image source={portrait} resizeMode="contain" className="h-[112%] w-[112%]" />
                      ) : (
                        <Text className="font-serif text-title text-rose-deep">
                          {companion.name.slice(0, 1).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-serif text-body font-semibold text-app-ink" numberOfLines={1}>
                        {companion.name}
                      </Text>
                      {companion.active_story_beat ? (
                        <View className="mt-1 flex-row items-center gap-1">
                          <Ionicons color="#9A2F4F" name="bookmark" size={11} />
                          <Text numberOfLines={1} className="text-caption font-semibold text-rose-deep">
                            {companion.active_story_beat.status === 'waiting_stage'
                              ? `Reach ${prettyStage(companion.active_story_beat.stage_gate)}`
                              : companion.active_story_beat.title}
                          </Text>
                        </View>
                      ) : null}
                      <Text numberOfLines={2} className="mt-1 text-caption text-app-muted">
                        {companion.opener}
                      </Text>
                    </View>
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-rose-soft">
                      <Ionicons color="#9A2F4F" name="arrow-forward" size={14} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </WebCard>
      </View>

      {/* Daily companion cards */}
      {companions.length > 0 ? (
        <View className="mt-10">
          <View className="mb-5 flex-row items-end justify-between">
            <View>
              <Text className="text-overline text-rose-deep">Today, with them</Text>
              <Text className="mt-1 font-serif text-title text-app-ink">What is on offer</Text>
            </View>
            <Text className="text-caption text-app-muted">{companions.length} cards</Text>
          </View>
          <View className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {companions.map((companion) => (
              <SceneDailyCompanion
                key={companion.id}
                companion={companion}
                sceneArt={scene.art_url}
                sceneId={scene.id}
              />
            ))}
          </View>
        </View>
      ) : null}
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
