import { Text, View } from 'react-native';

import type { RelationshipGoal } from '@/api/types';
import { activityLabel } from '@/utils/guided-action';

export function RelationshipGoalPanel({ goal }: { goal?: RelationshipGoal | null }) {
  if (!goal) return null;
  const progress = Math.max(0, Math.min(1, goal.stage_progress));

  return (
    <View className="rounded-lg border border-app-line bg-app-card p-5">
      <Text className="text-lg font-semibold text-app-text">Relationship goal</Text>
      <View className="mt-4 gap-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-sm text-app-muted">Stage</Text>
          <Text className="text-sm font-semibold text-app-text">{goal.stage}</Text>
        </View>
        <View className="h-3 overflow-hidden rounded-full bg-app-line">
          <View className="h-full rounded-full bg-app-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
        </View>
        <Text className="text-sm leading-5 text-app-muted">{goal.label}</Text>
        <View className="rounded-md bg-app-primarySoft px-3 py-2">
          <Text className="text-sm font-semibold text-app-primary">
            Recommended: {activityLabel(goal.recommended_activity)}
          </Text>
        </View>
      </View>
    </View>
  );
}
