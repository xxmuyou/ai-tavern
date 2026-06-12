import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { TodayRecommendation } from '@/api/types';
import { ActivityButtons } from '@/components/ActivityButtons';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SceneArtwork } from '@/components/SceneArtwork';
import { SCENES_ROUTE } from '@/constants/routes';
import { useToday } from '@/hooks/use-today';
import { deriveGuidedAction } from '@/utils/guided-action';

export function TodayHub({ web = false }: { web?: boolean }) {
  const router = useRouter();
  const { data, error, isLoading, refetch } = useToday();

  if (isLoading) {
    return <LoadingScreen label="Loading today..." />;
  }

  if (error || !data) {
    return (
      <EmptyState
        actionLabel="Try again"
        description="Today hub could not be loaded."
        onAction={refetch}
        title="Today unavailable"
      />
    );
  }

  return (
    <ScrollView className="flex-1">
      <View className={`mx-auto w-full gap-5 px-4 py-6 ${web ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <View className="gap-3">
          <Text className="text-3xl font-semibold text-app-text">Today in {data.city.name}</Text>
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="rounded-full bg-app-primarySoft px-3 py-1">
              <Text className="text-sm font-semibold text-app-primary">{data.time_slot}</Text>
            </View>
            <Text className="text-sm text-app-muted">{data.date_local}</Text>
          </View>
        </View>

        <View className={web ? 'grid grid-cols-1 gap-4 xl:grid-cols-3' : 'gap-4'}>
          {data.recommendations.map((recommendation) => (
            <TodayCard
              key={recommendation.companion.id}
              recommendation={recommendation}
              onOpenCompanion={() => router.push(`/companion/${encodeURIComponent(recommendation.companion.id)}` as Href)}
              onOpenScene={() => router.push(`/scene/${encodeURIComponent(recommendation.scene.id)}` as Href)}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(SCENES_ROUTE)}
          className="rounded-lg border border-app-line bg-app-card px-4 py-3"
        >
          <Text className="text-center text-base font-semibold text-app-text">Browse all scenes</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function TodayCard({
  onOpenCompanion,
  onOpenScene,
  recommendation,
}: {
  onOpenCompanion: () => void;
  onOpenScene: () => void;
  recommendation: TodayRecommendation;
}) {
  const portrait = mediaSource(recommendation.companion.art_url);
  const scene = mediaSource(recommendation.scene.art_url);
  const isBusy = recommendation.availability !== 'available';
  const guided = deriveGuidedAction({
    activityHint: recommendation.activity_hint,
    availability: recommendation.availability,
    goal: recommendation.next_goal,
    recommended: recommendation.suggested_activity,
  });
  const progress = Math.max(0, Math.min(1, recommendation.next_goal.stage_progress));

  return (
    <View className="overflow-hidden rounded-lg border border-app-line bg-app-card">
      <Pressable accessibilityRole="button" onPress={onOpenScene}>
        <SceneArtwork label={recommendation.scene.name} source={scene} />
      </Pressable>
      <View className="gap-4 p-4">
        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={onOpenCompanion}
            className="h-20 w-20 items-center justify-end overflow-hidden rounded-lg bg-app-primarySoft"
          >
            {portrait ? <Image source={portrait} resizeMode="contain" className="h-full w-full" /> : null}
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-xl font-semibold text-app-text">{recommendation.companion.name}</Text>
            <Text numberOfLines={1} className="mt-1 text-sm text-app-muted">{recommendation.scene.name}</Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <Badge label={recommendation.mood} />
              <Badge danger={isBusy} label={recommendation.availability} />
            </View>
          </View>
        </View>

        <View className="rounded-lg border border-app-line bg-app-bg p-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="rounded-full bg-app-primarySoft px-2.5 py-1">
              <Text className="text-xs font-semibold text-app-primary">{guided.statusLabel}</Text>
            </View>
            <Text className="text-sm font-semibold text-app-text">{guided.title}</Text>
          </View>
          <Text className="mt-1 text-sm leading-5 text-app-muted">{guided.body}</Text>
          <View className="mt-3 h-2 overflow-hidden rounded-full bg-app-line">
            <View className="h-full rounded-full bg-app-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
          </View>
        </View>
        <ActivityButtons
          activityHint={recommendation.activity_hint}
          availability={recommendation.availability}
          companionId={recommendation.companion.id}
          goal={recommendation.next_goal}
          onUnavailablePress={onOpenCompanion}
          recommended={recommendation.suggested_activity}
          sceneArt={recommendation.scene.art_url}
          sceneId={recommendation.scene.id}
          showGuidance={false}
        />
      </View>
    </View>
  );
}

function Badge({ danger, label }: { danger?: boolean; label: string }) {
  return (
    <View className={`rounded-full px-2 py-1 ${danger ? 'bg-app-warning/10' : 'bg-app-primarySoft'}`}>
      <Text className={`text-xs font-semibold ${danger ? 'text-app-warning' : 'text-app-primary'}`}>{label}</Text>
    </View>
  );
}
