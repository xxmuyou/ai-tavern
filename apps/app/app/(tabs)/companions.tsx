import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { CompanionCard } from '@/components/CompanionCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { useBilling } from '@/hooks/use-billing';
import { type CompanionSourceFilter, useCompanions } from '@/hooks/use-companions';

const FILTERS: { label: string; value: CompanionSourceFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Mine', value: 'user' },
  { label: 'Official', value: 'official' },
];

export default function CompanionsScreen() {
  const router = useRouter();
  const [source, setSource] = useState<CompanionSourceFilter>('all');
  const { data, error, isLoading, refetch } = useCompanions(source);
  const userCompanions = useCompanions('user');
  const billing = useBilling();

  function openCompanion(id: string) {
    router.push(`/companion/${encodeURIComponent(id)}` as Href);
  }

  function createCompanion() {
    const limit = billing.data?.entitlements.custom_companion_limit;
    const count = userCompanions.data?.items.length ?? 0;
    if (typeof limit === 'number' && count >= limit) {
      Alert.alert(
        "You've reached the free limit",
        'Free accounts can create up to 3 custom companions. Upgrade to Pro for unlimited companion creation.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade to Pro', onPress: () => router.push('/billing' as Href) },
        ],
      );
      return;
    }
    router.push('/companion-create' as Href);
  }

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar
        right={(
          <Pressable accessibilityRole="button" onPress={createCompanion} className="h-10 w-10 items-center justify-center rounded-lg bg-app-primary">
            <Ionicons color="#FFFFFF" name="add" size={22} />
          </Pressable>
        )}
        showQuota
        title="Companions"
      />
      <View className="mx-auto w-full max-w-4xl px-4 pt-4">
        <Text className="mb-3 text-sm font-semibold text-app-muted">
          {formatCompanionCount(userCompanions.data?.items.length ?? 0, billing.data?.entitlements.custom_companion_limit)}
        </Text>
        <View className="flex-row rounded-lg border border-app-line bg-app-card p-1">
          {FILTERS.map((filter) => {
            const isActive = filter.value === source;
            return (
              <Pressable
                key={filter.value}
                accessibilityRole="button"
                onPress={() => setSource(filter.value)}
                className={`min-h-10 flex-1 items-center justify-center rounded-md px-3 ${isActive ? 'bg-app-primary' : 'bg-transparent'}`}
              >
                <Text className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-app-muted'}`}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <LoadingScreen label="Loading companions..." />
      ) : error ? (
        <EmptyState
          actionLabel="Try again"
          description="Companions could not be loaded."
          onAction={refetch}
          title="Companions unavailable"
        />
      ) : !data?.items.length ? (
        <EmptyState
          actionLabel="Refresh"
          description={source === 'user' ? 'You do not have custom companions yet.' : 'No companions are active yet.'}
          onAction={refetch}
          title="No companions yet"
        />
      ) : (
        <ScrollView className="flex-1">
          <View className="mx-auto w-full max-w-4xl flex-row flex-wrap gap-4 px-4 py-6">
            {data.items.map((companion) => (
              <View key={companion.id} className="min-w-40" style={{ flexBasis: '47%' }}>
                <CompanionCard
                  artUrl={companion.art_url}
                  level={companion.current_level}
                  name={companion.name}
                  onPress={() => openCompanion(companion.id)}
                  role={companion.relationship_role}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function formatCompanionCount(count: number, limit: number | null | undefined): string {
  if (limit === null) {
    return `${count} custom companions`;
  }
  return `${count}/${limit ?? 3} custom companions`;
}
