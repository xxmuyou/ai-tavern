import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useBilling } from '@/hooks/use-billing';
import { useCredits } from '@/hooks/use-credits';

import { cn } from './cn';

type WebQuotaBadgeProps = {
  className?: string;
  onPress?: () => void;
};

export function WebQuotaBadge({ className, onPress }: WebQuotaBadgeProps) {
  const { data: billing } = useBilling();
  const { data: credits, isLoading } = useCredits();
  const Container = onPress ? Pressable : View;

  if (isLoading && !credits) {
    return (
      <Container
        accessibilityRole={onPress ? 'link' : undefined}
        onPress={onPress}
        className={cn('h-9 flex-row items-center gap-2 rounded-full border border-white/10 bg-white/[0.075] px-3.5', onPress && 'hover:bg-white/[0.075]', className)}
      >
        <View className="h-5 w-5 items-center justify-center rounded-full bg-emerald-300/12">
          <Ionicons color="#1E6B52" name="diamond-outline" size={11} />
        </View>
        <Text className="text-caption font-semibold text-rose-50/60">—</Text>
      </Container>
    );
  }

  const isPro = billing?.subscription.tier === 'pro';
  const balance = credits ? credits.available_credits.toLocaleString() : '—';
  const accent = isPro ? 'text-ember' : 'text-emerald-200';
  const bg = isPro ? 'bg-ember-soft' : 'bg-emerald-300/12';
  const iconName = isPro ? 'sparkles' : 'diamond-outline';

  return (
    <Container
      accessibilityRole={onPress ? 'link' : undefined}
      onPress={onPress}
      className={cn(
        'h-9 flex-row items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5',
        onPress && 'hover:bg-white/[0.075]',
        className,
      )}
    >
      <View className={cn('h-5 w-5 items-center justify-center rounded-full', bg)}>
        <Ionicons color={isPro ? '#9A4318' : '#1E6B52'} name={iconName} size={11} />
      </View>
      <Text className={cn('text-caption font-semibold', accent)}>{balance}</Text>
      <Text className="text-caption text-rose-50/60">credits</Text>
    </Container>
  );
}
