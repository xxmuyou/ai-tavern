import { Text, View } from 'react-native';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';

import type { SceneCompanionPresent } from '@/api/types';
import { ActivityButtons } from '@/components/ActivityButtons';
import { DailyStateSummary } from '@/components/DailyStateSummary';
import { useDailyState } from '@/hooks/use-daily-state';

type SceneDailyCompanionProps = {
  companion: SceneCompanionPresent;
  sceneArt?: string | null;
  sceneId: string;
};

export function SceneDailyCompanion({ companion, sceneArt, sceneId }: SceneDailyCompanionProps) {
  const router = useRouter();
  const { data, error, isLoading } = useDailyState(companion.id);

  function openChat() {
    const params = new URLSearchParams({ sceneId });
    if (sceneArt) params.set('sceneArt', sceneArt);
    router.push(`/chat/${encodeURIComponent(companion.id)}?${params.toString()}` as Href);
  }

  return (
    <View className="gap-3 rounded-lg border border-app-line bg-app-card p-4">
      <Text className="text-base font-semibold text-app-text">{companion.name}</Text>
      <Text className="text-sm leading-5 text-app-muted">{companion.opener}</Text>
      {isLoading ? (
        <Text className="text-sm text-app-muted">Loading today state...</Text>
      ) : error || !data ? (
        <Text className="text-sm text-app-muted">Today state is unavailable.</Text>
      ) : (
        <>
          <DailyStateSummary dailyState={data} />
          <ActivityButtons
            activityHint={data.activity_hint}
            availability={data.availability}
            companionId={companion.id}
            onContinueStory={openChat}
            onUnavailablePress={() => router.push(`/companion/${encodeURIComponent(companion.id)}` as Href)}
            sceneArt={sceneArt}
            sceneId={sceneId}
            storyBeat={companion.active_story_beat}
          />
        </>
      )}
    </View>
  );
}
