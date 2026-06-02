import { Text, View } from 'react-native';

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
  const { data, error, isLoading } = useDailyState(companion.id);

  return (
    <View className="gap-3 rounded-lg border border-app-line bg-app-card p-4">
      <Text className="text-base font-semibold text-app-text">{companion.name}</Text>
      {companion.active_story_beat ? (
        <View className="self-start rounded-full bg-app-primarySoft px-2.5 py-1">
          <Text className="text-xs font-semibold text-app-primary">
            {companion.active_story_beat.title}
          </Text>
        </View>
      ) : null}
      <Text className="text-sm leading-5 text-app-muted">{companion.opener}</Text>
      {companion.active_story_beat?.objective ? (
        <Text className="text-xs leading-4 text-app-muted">
          {companion.active_story_beat.objective}
        </Text>
      ) : null}
      {isLoading ? (
        <Text className="text-sm text-app-muted">Loading today state...</Text>
      ) : error || !data ? (
        <Text className="text-sm text-app-muted">Today state is unavailable.</Text>
      ) : (
        <>
          <DailyStateSummary dailyState={data} />
          <ActivityButtons
            availability={data.availability}
            companionId={companion.id}
            recommended="hang_out"
            sceneArt={sceneArt}
            sceneId={sceneId}
          />
        </>
      )}
    </View>
  );
}
