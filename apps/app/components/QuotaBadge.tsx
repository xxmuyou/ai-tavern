import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useBilling } from '@/hooks/use-billing';

export function QuotaBadge() {
  const { data, isLoading } = useBilling();

  if (isLoading || !data) {
    return (
      <View className="h-9 min-w-20 items-center justify-center rounded-full border border-app-line bg-app-card px-3">
        <Text className="text-xs font-semibold text-app-muted">Usage</Text>
      </View>
    );
  }

  const isPro = data.subscription.tier === 'pro';
  const limit = data.usage.message_limit_daily;
  const label = isPro ? 'Pro' : `${data.usage.messages_used_today}/${limit ?? 30}`;

  return (
    <View className="h-9 flex-row items-center gap-2 rounded-full border border-app-line bg-app-card px-3">
      <Ionicons color={isPro ? '#B65C3A' : '#1E6B52'} name={isPro ? 'sparkles' : 'chatbubble-outline'} size={15} />
      <Text className="text-xs font-semibold text-app-text">{label}</Text>
    </View>
  );
}
