import { Text, View } from 'react-native';

import type { ActivityType, Availability } from '@/api/types';
import { ActivityButtons } from '@/components/ActivityButtons';
import { DailyStateSummary } from '@/components/DailyStateSummary';
import { useDailyState } from '@/hooks/use-daily-state';

type CompanionTodayPanelProps = {
  companionId: string;
  recommended?: ActivityType | null;
};

export function CompanionTodayPanel({ companionId, recommended }: CompanionTodayPanelProps) {
  const { data, error, isLoading, refetch } = useDailyState(companionId, true);

  if (isLoading) {
    return (
      <View className="rounded-lg border border-app-line bg-app-card p-5">
        <Text className="text-lg font-semibold text-app-text">Today</Text>
        <Text className="mt-3 text-sm text-app-muted">Loading today state...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className="rounded-lg border border-app-line bg-app-card p-5">
        <Text className="text-lg font-semibold text-app-text">Today</Text>
        <Text className="mt-3 text-sm text-app-muted" onPress={refetch}>Today state could not be loaded.</Text>
      </View>
    );
  }

  return (
    <View className="gap-4 rounded-lg border border-app-line bg-app-card p-5">
      <Text className="text-lg font-semibold text-app-text">Today</Text>
      <DailyStateSummary dailyState={data} />
      <ActivityButtons
        availability={data.availability as Availability}
        companionId={companionId}
        recommended={recommended ?? 'hang_out'}
        sceneArt={data.scene.art_url}
        sceneId={data.scene.id}
      />
    </View>
  );
}
