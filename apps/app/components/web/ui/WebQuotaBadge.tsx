import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useBilling } from '@/hooks/use-billing';

import { cn } from './cn';

type WebQuotaBadgeProps = {
  className?: string;
};

export function WebQuotaBadge({ className }: WebQuotaBadgeProps) {
  const { data, isLoading } = useBilling();

  if (isLoading || !data) {
    return (
      <View className={cn('h-9 items-center justify-center rounded-full border border-app-line bg-app-sunken/50 px-3.5', className)}>
        <Text className="text-caption font-semibold text-app-muted">Usage</Text>
      </View>
    );
  }

  const isPro = data.subscription.tier === 'pro';
  const limit = data.usage.message_limit_daily;
  const used = data.usage.messages_used_today;
  const label = isPro ? 'Pro' : `${used}/${limit ?? 30}`;
  const accent = isPro ? 'text-ember' : 'text-rose-deep';
  const bg = isPro ? 'bg-ember-soft' : 'bg-rose-soft';
  const iconName = isPro ? 'sparkles' : 'chatbubble-ellipses-outline';

  return (
    <View
      className={cn(
        'h-9 flex-row items-center gap-2 rounded-full border border-app-line bg-app-surface px-3.5',
        className,
      )}
    >
      <View className={cn('h-5 w-5 items-center justify-center rounded-full', bg)}>
        <Ionicons color={isPro ? '#9A4318' : '#9A2F4F'} name={iconName} size={11} />
      </View>
      <Text className={cn('text-caption font-semibold', accent)}>{label}</Text>
      {isPro ? null : (
        <Text className="text-caption text-app-muted">messages today</Text>
      )}
    </View>
  );
}
