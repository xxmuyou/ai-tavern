import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

import { mediaSource, resolveStoryChoice } from '@/api/companion-client';
import type { StoryChoice, StoryChoiceResolveResponse } from '@/api/types';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { EventPopup } from '@/components/EventPopup';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SceneCompanionCard } from '@/components/SceneCompanionCard';
import { SceneDailyCompanion } from '@/components/SceneDailyCompanion';
import { StoryMomentPopup } from '@/components/StoryMomentPopup';
import { TopBar } from '@/components/TopBar';
import { SCENES_ROUTE } from '@/constants/routes';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { usePendingEvents } from '@/hooks/use-pending-events';
import { useSceneEntry } from '@/hooks/use-scenes';

export default function SceneDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sceneId = Array.isArray(id) ? id[0] : id;
  const { pushError } = useErrorBanner();
  const { data, error, isLoading, refetch } = useSceneEntry(sceneId);
  const pendingEvents = usePendingEvents(data?.event ?? null);
  const [storyResult, setStoryResult] = useState<StoryChoiceResolveResponse | null>(null);
  const [isResolvingStory, setIsResolvingStory] = useState(false);
  const [storyClosed, setStoryClosed] = useState(false);

  useEffect(() => {
    const status = (error as Error & { status?: number } | null)?.status;
    if (status === 403) {
      pushError('This scene is still locked.');
      router.replace(SCENES_ROUTE);
    }
  }, [error, pushError, router]);

  useEffect(() => {
    setStoryClosed(false);
    setStoryResult(null);
  }, [sceneId]);

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
  const storyCompanion = companions.find((companion) => companion.story_moment) ?? null;
  const storyMoment = storyCompanion?.story_moment ?? null;
  const storyVisible = Boolean(storyMoment) && !storyClosed && !pendingEvents.visible;

  async function handleStoryChoice(choice: StoryChoice) {
    if (!storyCompanion) return;
    setIsResolvingStory(true);
    try {
      const result = await resolveStoryChoice(storyCompanion.id, choice.id, { scene_id: scene.id });
      setStoryResult(result);
    } catch (err) {
      pushError(err instanceof Error ? err.message : 'Story moment could not be resolved.');
    } finally {
      setIsResolvingStory(false);
    }
  }

  function closeStoryMoment() {
    const target = storyResult?.transition_mode === 'scene' ? storyResult.target_scene : null;
    setStoryClosed(true);
    setStoryResult(null);
    if (target) {
      router.replace(`/scene/${encodeURIComponent(target.id)}` as Href);
    }
  }

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
            <View className="relative aspect-video w-full overflow-hidden bg-app-primarySoft">
              {imageSource ? (
                <>
                  <Image source={imageSource} resizeMode="cover" blurRadius={14} className="absolute inset-0 h-full w-full opacity-35" />
                  <View pointerEvents="none" className="absolute inset-0 bg-app-bg/35" />
                  <Image source={imageSource} resizeMode="contain" className="relative z-10 h-full w-full" />
                </>
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
                        storyBeat={companion.active_story_beat}
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
      <EventPopup
        event={pendingEvents.current}
        isResolving={pendingEvents.isResolving}
        result={pendingEvents.result}
        visible={pendingEvents.visible}
        onClose={pendingEvents.close}
        onResolve={(event, optionId) => {
          void pendingEvents.resolve(event, optionId).catch((err) => {
            pushError(err instanceof Error ? err.message : 'Event could not be resolved.');
          });
        }}
      />
      <StoryMomentPopup
        isResolving={isResolvingStory}
        moment={storyMoment}
        result={storyResult}
        sceneName={scene.name}
        visible={storyVisible}
        onClose={closeStoryMoment}
        onResolve={(choice) => {
          void handleStoryChoice(choice);
        }}
      />
    </View>
  );
}
