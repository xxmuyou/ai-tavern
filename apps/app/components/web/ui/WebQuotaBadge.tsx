import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

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
        className={cn('h-9 flex-row items-center gap-2 rounded-full border border-app-line bg-app-sunken/50 px-3.5', onPress && 'hover:bg-app-surface', className)}
      >
        <View className="h-5 w-5 items-center justify-center rounded-full bg-app-brand-soft">
          <Ionicons color={PALETTE.rose} name="diamond-outline" size={11} />
        </View>
        <Text className="text-caption font-semibold text-app-muted">—</Text>
      </Container>
    );
  }

  const isPro = billing?.subscription.tier === 'pro';
  const balance = credits ? credits.available_credits.toLocaleString() : '—';
  const accent = isPro ? 'text-[#FFE0B6]' : 'text-app-brand-deep';
  const bg = isPro ? 'bg-app-ember-soft' : 'bg-app-brand-soft';
  const containerTone = isPro
    ? 'border-app-ember/35 bg-[#21130e]'
    : 'border-app-line bg-app-surface';
  const iconName = isPro ? 'sparkles' : 'diamond-outline';

  return (
    <Container
      accessibilityRole={onPress ? 'link' : undefined}
      onPress={onPress}
      className={cn(
        'h-9 flex-row items-center gap-2 rounded-full border px-3.5',
        containerTone,
        onPress && 'hover:border-app-rose/40',
        className,
      )}
    >
      <View className={cn('h-5 w-5 items-center justify-center rounded-full', bg)}>
        <Ionicons color={isPro ? PALETTE.ember : PALETTE.rose} name={iconName} size={11} />
      </View>
      {isPro ? (
        <Text className="text-caption font-bold uppercase text-[#FFD39A]">Pro</Text>
      ) : null}
      <Text className={cn('text-caption font-semibold', accent)}>{balance}</Text>
      <Text className="text-caption text-rose-50/70">credits</Text>
    </Container>
  );
}
