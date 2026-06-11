import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import { useBilling } from '@/hooks/use-billing';
import { useCredits } from '@/hooks/use-credits';

import { cn } from './cn';

type WebQuotaBadgeProps = {
  className?: string;
};

export function WebQuotaBadge({ className }: WebQuotaBadgeProps) {
  const { data: billing } = useBilling();
  const { data: credits, isLoading } = useCredits();

  if (isLoading && !credits) {
    return (
      <View className={cn('h-9 flex-row items-center gap-2 rounded-full border border-app-line bg-app-sunken/50 px-3.5', className)}>
        <View className="h-5 w-5 items-center justify-center rounded-full bg-app-brand-soft">
          <Ionicons color={PALETTE.rose} name="diamond-outline" size={11} />
        </View>
        <Text className="text-caption font-semibold text-app-muted">—</Text>
      </View>
    );
  }

  const isPro = billing?.subscription.tier === 'pro';
  const balance = credits ? credits.available_credits.toLocaleString() : '—';
  const accent = isPro ? 'text-ember' : 'text-app-brand';
  const bg = isPro ? 'bg-ember-soft' : 'bg-app-brand-soft';
  const iconName = isPro ? 'sparkles' : 'diamond-outline';

  return (
    <View
      className={cn(
        'h-9 flex-row items-center gap-2 rounded-full border border-app-line bg-app-surface px-3.5',
        className,
      )}
    >
      <View className={cn('h-5 w-5 items-center justify-center rounded-full', bg)}>
        <Ionicons color={isPro ? PALETTE.ember : PALETTE.rose} name={iconName} size={11} />
      </View>
      <Text className={cn('text-caption font-semibold', accent)}>{balance}</Text>
      <Text className="text-caption text-app-muted">credits</Text>
    </View>
  );
}
