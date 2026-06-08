import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { mediaSource, resolveStoryChoice } from '@/api/companion-client';
import type { SceneCompanionPresent, StoryChoice, StoryChoiceResolveResponse } from '@/api/types';
import { WebAppShell } from '@/components/web/WebAppShell';
import { ActivityButtons } from '@/components/ActivityButtons';
import { DailyStateSummary } from '@/components/DailyStateSummary';
import { EventPopup } from '@/components/EventPopup';
import {
  WebCard,
  WebEmptyState,
  WebLoading,
  WebTag,
} from '@/components/web/ui';
import { SCENES_ROUTE } from '@/constants/routes';
import { useDailyState } from '@/hooks/use-daily-state';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSceneEntry } from '@/hooks/use-scenes';
import { usePendingEvents } from '@/hooks/use-pending-events';
import { deriveGuidedAction } from '@/utils/guided-action';
import { StoryMomentPopup } from '@/components/StoryMomentPopup';

export default function WebSceneDetailScreen() {
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
              <Text className="mt-2 font-serif text-title text-app-ink">{`"${scene.mood}"`}</Text>
            </View>
          </View>
        </WebCard>

        <WebCard padding="lg" className="gap-5">
          <View>
            <Text className="text-overline text-rose-deep">At a glance</Text>
            <Text className="mt-1 font-serif text-title text-app-ink">Scene state</Text>
          </View>
          <View className="gap-3">
            <View className="rounded-2xl border border-app-line-soft bg-app-sunken/50 p-4">
              <Text className="text-caption text-app-muted">Companions here</Text>
              <Text className="mt-1 font-serif text-display-sm text-app-ink">{companions.length}</Text>
            </View>
            <View className="rounded-2xl border border-app-line-soft bg-app-sunken/50 p-4">
              <Text className="text-caption text-app-muted">Mood</Text>
              <Text className="mt-1 text-body-sm leading-6 text-app-ink-soft">{scene.mood}</Text>
            </View>
          </View>
        </WebCard>
      </View>

      {companions.length > 0 ? (
        <View className="mt-10">
          <View className="mb-5 flex-row items-end justify-between">
            <View>
              <Text className="text-overline text-rose-deep">Guided actions</Text>
              <Text className="mt-1 font-serif text-title text-app-ink">Choose the next step</Text>
            </View>
            <Text className="text-caption text-app-muted">{companions.length} available</Text>
          </View>
          <View className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {companions.map((companion) => (
              <SceneActionCard
                key={companion.id}
                companion={companion}
                sceneArt={scene.art_url}
                sceneId={scene.id}
              />
            ))}
          </View>
        </View>
      ) : (
        <WebCard padding="lg" className="mt-10 gap-2">
          <Text className="text-overline text-rose-deep">Guided actions</Text>
          <Text className="font-serif text-title text-app-ink">No one is here right now</Text>
          <Text className="text-body-sm leading-6 text-app-ink-soft">
            Browse another scene or come back later when a companion is available.
          </Text>
        </WebCard>
      )}
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
    </WebAppShell>
  );
}

function SceneActionCard({
  companion,
  sceneArt,
  sceneId,
}: {
  companion: SceneCompanionPresent;
  sceneArt?: string | null;
  sceneId: string;
}) {
  const router = useRouter();
  const daily = useDailyState(companion.id);
  const portrait = mediaSource(companion.art_url);
  const guided = deriveGuidedAction({
    activityHint: daily.data?.activity_hint ?? companion.opener,
    availability: daily.data?.availability ?? 'available',
    storyBeat: companion.active_story_beat,
  });

  function openChat() {
    const params = new URLSearchParams({ sceneId });
    if (sceneArt) params.set('sceneArt', sceneArt);
    router.push(`/chat/${encodeURIComponent(companion.id)}?${params.toString()}` as Href);
  }

  return (
    <WebCard padding="lg" className="gap-5">
      <View className="flex-row gap-4">
        <View className="h-24 w-20 items-center justify-end overflow-hidden rounded-2xl bg-rose-soft">
          {portrait ? (
            <Image source={portrait} resizeMode="contain" className="h-[112%] w-[112%]" />
          ) : (
            <Text className="font-serif text-title text-rose-deep">
              {companion.name.slice(0, 1).toUpperCase()}
            </Text>
          )}
        </View>
        <View className="min-w-0 flex-1 gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-serif text-title-sm text-app-ink">{companion.name}</Text>
            <WebTag size="sm" variant={guided.source === 'story' ? 'rose' : 'neutral'}>
              {guided.statusLabel}
            </WebTag>
          </View>
          <Text className="text-body-sm leading-6 text-app-ink-soft">{companion.opener}</Text>
        </View>
      </View>

      <View className="rounded-2xl border border-app-line-soft bg-app-sunken/50 p-4">
        <Text className="text-caption font-semibold uppercase tracking-normal text-rose-deep">
          {guided.source === 'story' ? 'Story objective' : 'Recommended next step'}
        </Text>
        <Text className="mt-1 font-serif text-title-sm text-app-ink">{guided.title}</Text>
        <Text className="mt-2 text-body-sm leading-6 text-app-ink-soft">{guided.body}</Text>
      </View>

      {daily.isLoading ? (
        <Text className="text-body-sm text-app-muted">Loading today state...</Text>
      ) : daily.error || !daily.data ? (
        <Text className="text-body-sm text-app-muted">Today state is unavailable.</Text>
      ) : (
        <DailyStateSummary dailyState={daily.data} />
      )}

      <ActivityButtons
        activityHint={daily.data?.activity_hint ?? companion.opener}
        availability={daily.data?.availability ?? 'available'}
        companionId={companion.id}
        onContinueStory={openChat}
        onUnavailablePress={() => router.push(`/companion/${encodeURIComponent(companion.id)}` as Href)}
        sceneArt={sceneArt}
        sceneId={sceneId}
        showGuidance={false}
        storyBeat={companion.active_story_beat}
      />
    </WebCard>
  );
}
