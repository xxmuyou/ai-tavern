import { Text, View } from 'react-native';

import type { RelationshipGoal } from '@/api/types';

function prettyStage(stage: string): string {
  return stage
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Compact, always-on relationship strip for the chat screen: current stage +
 * progress bar + a one-line next goal. Lighter than `RelationshipGoalPanel`
 * (which is a full card used on the profile/home screens). Shared across web
 * and native via nativewind classNames.
 */
export function ChatRelationshipHud({ goal }: { goal?: RelationshipGoal | null }) {
  if (!goal) {
    return null;
  }
  const progress = Math.max(0, Math.min(1, goal.stage_progress));
  const percent = Math.round(progress * 100);

  return (
    <View className="border-b border-app-line bg-app-card px-4 py-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-app-primary">
          {prettyStage(goal.stage)}
        </Text>
        <Text className="text-xs font-medium text-app-muted">{percent}%</Text>
      </View>
      <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-app-line">
        <View className="h-full rounded-full bg-app-primary" style={{ width: `${percent}%` }} />
      </View>
      {goal.label ? (
        <Text numberOfLines={1} className="mt-1 text-xs text-app-muted">
          {goal.label}
        </Text>
      ) : null}
    </View>
  );
}
