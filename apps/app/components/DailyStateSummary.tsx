import { Text, View } from 'react-native';

import type { DailyState } from '@/api/types';

export function DailyStateSummary({ dailyState }: { dailyState: DailyState }) {
  const busy = dailyState.availability !== 'available';
  return (
    <View className="gap-2 rounded-md bg-app-bg p-3">
      <View className="flex-row flex-wrap gap-2">
        <Badge label={dailyState.mood} />
        <Badge danger={busy} label={dailyState.availability} />
        <Badge label={dailyState.time_slot} />
      </View>
      <Text className="text-sm leading-5 text-app-muted">
        {dailyState.scene.name} · {dailyState.activity_hint}
      </Text>
      {dailyState.flavor_text ? <Text className="text-sm leading-5 text-app-text">{dailyState.flavor_text}</Text> : null}
    </View>
  );
}

function Badge({ danger, label }: { danger?: boolean; label: string }) {
  return (
    <View className={`rounded-full px-2 py-1 ${danger ? 'bg-app-warning/10' : 'bg-app-primarySoft'}`}>
      <Text className={`text-xs font-semibold ${danger ? 'text-app-warning' : 'text-app-primary'}`}>{label}</Text>
    </View>
  );
}
