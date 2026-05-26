import { Pressable, Text, View } from 'react-native';

import type { ActivityContext } from '@/api/types';
import { activityLabel } from '@/components/ActivityButtons';
import { DailyStateSummary } from '@/components/DailyStateSummary';

type ActivityContextBannerProps = {
  activity: ActivityContext | null;
  isMutating?: boolean;
  onCancel?: () => void;
  onComplete?: () => void;
};

export function ActivityContextBanner({
  activity,
  isMutating,
  onCancel,
  onComplete,
}: ActivityContextBannerProps) {
  if (!activity) return null;
  const active = activity.status === 'active';

  return (
    <View className="gap-3 border-b border-app-line bg-app-card px-4 py-3">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-app-text">
            {activityLabel(activity.type)} at {activity.scene.name}
          </Text>
          <Text className="mt-1 text-xs uppercase tracking-normal text-app-muted">{activity.status}</Text>
        </View>
        {active ? (
          <View className="flex-row gap-2">
            <ActionButton disabled={isMutating} label="Complete" onPress={onComplete} primary />
            <ActionButton disabled={isMutating} label="Cancel" onPress={onCancel} />
          </View>
        ) : null}
      </View>
      <DailyStateSummary dailyState={activity.daily_state} />
    </View>
  );
}

function ActionButton({
  disabled,
  label,
  onPress,
  primary,
}: {
  disabled?: boolean;
  label: string;
  onPress?: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-md border px-3 py-2 ${primary ? 'border-app-primary bg-app-primary' : 'border-app-line bg-app-card'} ${
        disabled ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <Text className={`text-sm font-semibold ${primary ? 'text-white' : 'text-app-text'}`}>{label}</Text>
    </Pressable>
  );
}
