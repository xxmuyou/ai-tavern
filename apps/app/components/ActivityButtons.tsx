import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import type { ActivityType, Availability } from '@/api/types';
import { useActivities } from '@/hooks/use-activities';
import { useErrorBanner } from '@/hooks/use-error-banner';

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  check_in: 'Check in',
  date: 'Date',
  gift: 'Gift',
  hang_out: 'Hang out',
  invite: 'Invite',
  repair: 'Repair',
};

const DEFAULT_TYPES: ActivityType[] = ['check_in', 'hang_out', 'invite', 'date', 'gift', 'repair'];

type ActivityButtonsProps = {
  availability?: Availability;
  companionId: string;
  recommended?: ActivityType | null;
  sceneArt?: string | null;
  sceneId?: string | null;
};

export function ActivityButtons({
  availability = 'available',
  companionId,
  recommended,
  sceneArt,
  sceneId,
}: ActivityButtonsProps) {
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const activities = useActivities();
  const types = recommended ? [recommended, ...DEFAULT_TYPES.filter((type) => type !== recommended)].slice(0, 4) : DEFAULT_TYPES.slice(0, 4);
  const disabled = availability === 'away';

  async function start(type: ActivityType) {
    if (disabled || activities.isMutating) return;
    try {
      const payload = await activities.start({ companion_id: companionId, scene_id: sceneId ?? undefined, type });
      const params = new URLSearchParams({ activityId: payload.activity.id });
      if (payload.activity.scene.id) params.set('sceneId', payload.activity.scene.id);
      if (sceneArt) params.set('sceneArt', sceneArt);
      router.push(`/chat/${encodeURIComponent(companionId)}?${params.toString()}` as Href);
    } catch (error) {
      pushError(error instanceof Error ? error.message : 'Activity could not be started.');
    }
  }

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {types.map((type) => {
          const isRecommended = type === recommended;
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              disabled={disabled || activities.isMutating}
              onPress={() => void start(type)}
              className={`rounded-lg border px-3 py-2 ${
                isRecommended ? 'border-app-primary bg-app-primary' : 'border-app-line bg-app-card'
              } ${disabled || activities.isMutating ? 'opacity-50' : 'opacity-100'}`}
            >
              <Text className={`text-sm font-semibold ${isRecommended ? 'text-white' : 'text-app-text'}`}>
                {ACTIVITY_LABELS[type]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {disabled ? <Text className="text-sm text-app-muted">This companion is not available for activities right now.</Text> : null}
    </View>
  );
}

export function activityLabel(type?: ActivityType | null): string {
  return type ? ACTIVITY_LABELS[type] : 'Activity';
}
