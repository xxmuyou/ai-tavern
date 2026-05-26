import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { CompanionListItem } from '@/api/types';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/Button';
import { WebAppShell } from '@/components/web/WebAppShell';
import { useBilling } from '@/hooks/use-billing';
import { type CompanionSourceFilter, useCompanions } from '@/hooks/use-companions';
import { formatLevel } from '@/utils/format';

const FILTERS: { label: string; value: CompanionSourceFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Mine', value: 'user' },
  { label: 'Official', value: 'official' },
];

export default function WebCompanionsScreen() {
  const router = useRouter();
  const [source, setSource] = useState<CompanionSourceFilter>('all');
  const { data, error, isLoading, refetch } = useCompanions(source);
  const userCompanions = useCompanions('user');
  const billing = useBilling();

  function createCompanion() {
    const limit = billing.data?.entitlements.custom_companion_limit;
    const count = userCompanions.data?.items.length ?? 0;
    if (typeof limit === 'number' && count >= limit) {
      window.alert('Free accounts can create up to 3 custom companions. Upgrade to Pro for unlimited companion creation.');
      return;
    }
    router.push('/companion-create' as Href);
  }

  if (isLoading) {
    return <LoadingScreen label="Loading companions..." />;
  }

  return (
    <WebAppShell
      actions={<Button label="Create" onPress={createCompanion} />}
      title="Companions"
      subtitle="Scan official and custom companions with desktop-density cards."
    >
      <View className="mb-6 flex-row flex-wrap items-center gap-2">
        {FILTERS.map((filter) => {
          const active = filter.value === source;
          return (
            <Pressable
              key={filter.value}
              accessibilityRole="button"
              onPress={() => setSource(filter.value)}
              className={`rounded-md border px-4 py-2 ${active ? 'border-app-primary bg-app-primary' : 'border-app-line bg-white'}`}
            >
              <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-app-muted'}`}>{filter.label}</Text>
            </Pressable>
          );
        })}
        <View className="ml-auto flex-row items-center gap-2 rounded-full bg-white px-3 py-2">
          <Ionicons color="#687076" name="sparkles-outline" size={16} />
          <Text className="text-sm font-semibold text-app-muted">
            {formatCompanionCount(userCompanions.data?.items.length ?? 0, billing.data?.entitlements.custom_companion_limit)}
          </Text>
        </View>
      </View>

      {error ? (
        <EmptyState actionLabel="Try again" description="Companions could not be loaded." onAction={refetch} title="Companions unavailable" />
      ) : !data?.items.length ? (
        <EmptyState actionLabel="Refresh" description="No companions are active yet." onAction={refetch} title="No companions yet" />
      ) : (
        <View className="flex-row flex-wrap gap-5">
          {data.items.map((companion) => (
            <CompanionTile key={companion.id} companion={companion} onPress={() => router.push(`/companion/${encodeURIComponent(companion.id)}` as Href)} />
          ))}
        </View>
      )}
    </WebAppShell>
  );
}

function formatCompanionCount(count: number, limit: number | null | undefined): string {
  if (limit === null) {
    return `${count} custom companions`;
  }
  return `${count}/${limit ?? 3} custom companions`;
}

function CompanionTile({ companion, onPress }: { companion: CompanionListItem; onPress: () => void }) {
  const imageSource = mediaSource(companion.art_url);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="min-w-[220px] flex-1 rounded-lg border border-app-line bg-white p-4">
      <View className="aspect-[4/5] items-center justify-end overflow-hidden rounded-lg border border-app-line bg-app-primarySoft">
        <View pointerEvents="none" style={tileStyles.portraitFloor} />
        {imageSource ? (
          <Image accessibilityLabel={companion.name} resizeMode="contain" source={imageSource} style={tileStyles.portraitImage} />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Text className="text-5xl font-semibold text-app-primary">{companion.name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View className="mt-4 gap-2">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="min-w-0 flex-1 text-xl font-semibold text-app-text">{companion.name}</Text>
          <View className="rounded-full bg-app-primarySoft px-3 py-1">
            <Text className="text-xs font-semibold text-app-primary">{formatLevel(companion.current_level)}</Text>
          </View>
        </View>
        {companion.relationship_role ? <Text className="text-xs uppercase tracking-normal text-app-muted">{companion.relationship_role}</Text> : null}
      </View>
    </Pressable>
  );
}

const tileStyles = StyleSheet.create({
  portraitFloor: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    bottom: 0,
    height: 58,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  portraitImage: {
    height: '108%',
    transform: [{ translateY: 10 }],
    width: '108%',
  },
});
