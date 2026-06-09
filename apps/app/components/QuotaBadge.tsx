import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useBilling } from '@/hooks/use-billing';
import { useCredits } from '@/hooks/use-credits';

export function QuotaBadge() {
  const { data: billing } = useBilling();
  const { data: credits, isLoading } = useCredits();

  const isPro = billing?.subscription.tier === 'pro';

  if (isLoading && !credits) {
    return (
      <View className="h-9 flex-row min-w-20 items-center justify-center gap-2 rounded-full border border-app-line bg-app-card px-3">
        <Ionicons color="#1E6B52" name="diamond-outline" size={15} />
        <Text className="text-xs font-semibold text-app-muted">—</Text>
      </View>
    );
  }

  const balance = credits ? credits.available_credits.toLocaleString() : '—';

  return (
    <View className="h-9 flex-row items-center gap-2 rounded-full border border-app-line bg-app-card px-3">
      <Ionicons color={isPro ? '#B65C3A' : '#1E6B52'} name={isPro ? 'sparkles' : 'diamond-outline'} size={15} />
      <Text className="text-xs font-semibold text-app-text">{balance}</Text>
    </View>
  );
}
