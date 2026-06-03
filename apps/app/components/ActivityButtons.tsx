import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ActivityType, Availability, RelationshipGoal, StoryBeat } from '@/api/types';
import { useActivities } from '@/hooks/use-activities';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { activityLabel, deriveGuidedAction } from '@/utils/guided-action';

const DEFAULT_TYPES: ActivityType[] = ['check_in', 'hang_out', 'invite', 'date', 'gift', 'repair'];

type ActivityButtonsProps = {
  activityHint?: string | null;
  availability?: Availability;
  companionId: string;
  goal?: RelationshipGoal | null;
  onContinueStory?: () => void;
  recommended?: ActivityType | null;
  sceneArt?: string | null;
  sceneId?: string | null;
  showGuidance?: boolean;
  storyBeat?: StoryBeat | null;
  variant?: 'default' | 'compact';
  onUnavailablePress?: () => void;
};

export function ActivityButtons({
  activityHint,
  availability = 'available',
  companionId,
  goal,
  onContinueStory,
  onUnavailablePress,
  recommended,
  sceneArt,
  sceneId,
  showGuidance = true,
  storyBeat,
  variant = 'default',
}: ActivityButtonsProps) {
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const activities = useActivities();
  const [moreOpen, setMoreOpen] = useState(false);
  const guided = useMemo(
    () => deriveGuidedAction({ activityHint, availability, goal, recommended, storyBeat }),
    [activityHint, availability, goal, recommended, storyBeat],
  );
  const primaryType = guided.activityType;
  const secondaryTypes = DEFAULT_TYPES.filter((type) => type !== primaryType).slice(0, 2);
  const moreTypes = DEFAULT_TYPES.filter((type) => type !== primaryType && !secondaryTypes.includes(type));
  const disabled = availability === 'away';
  const primaryStartsStory = guided.source === 'story' && typeof onContinueStory === 'function';

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
    <View className={variant === 'compact' ? 'gap-2' : 'gap-3'}>
      {showGuidance ? (
        <View className="gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="rounded-full bg-app-primarySoft px-2.5 py-1">
              <Text className="text-xs font-semibold text-app-primary">{guided.statusLabel}</Text>
            </View>
            <Text className="text-sm font-semibold text-app-text">{guided.title}</Text>
          </View>
          <Text className="text-sm leading-5 text-app-muted">{guided.body}</Text>
        </View>
      ) : null}
      {guided.canStartActivity && primaryType ? (
        <>
          <View className="flex-row flex-wrap gap-2">
            <ActionButton
              disabled={disabled || activities.isMutating}
              label={guided.label}
              onPress={primaryStartsStory ? onContinueStory : () => void start(primaryType)}
              primary
            />
            {secondaryTypes.map((type) => (
              <ActionButton
                key={type}
                disabled={disabled || activities.isMutating}
                label={activityLabel(type)}
                onPress={() => void start(type)}
              />
            ))}
          </View>
          {moreTypes.length ? (
            <View className="gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={() => setMoreOpen((value) => !value)}
                className="self-start rounded-md px-1 py-1"
              >
                <Text className="text-sm font-semibold text-app-primary">
                  {moreOpen ? 'Hide actions' : 'More actions'}
                </Text>
              </Pressable>
              {moreOpen ? (
                <View className="flex-row flex-wrap gap-2">
                  {moreTypes.map((type) => (
                    <ActionButton
                      key={type}
                      disabled={disabled || activities.isMutating}
                      label={activityLabel(type)}
                      onPress={() => void start(type)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <ActionButton disabled={!onUnavailablePress} label={guided.label} onPress={onUnavailablePress} />
      )}
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
      className={`min-h-10 rounded-lg border px-3 py-2 ${
        primary ? 'border-app-primary bg-app-primary' : 'border-app-line bg-app-card'
      } ${disabled ? 'opacity-50' : 'opacity-100'}`}
    >
      <Text className={`text-sm font-semibold ${primary ? 'text-white' : 'text-app-text'}`}>{label}</Text>
    </Pressable>
  );
}
