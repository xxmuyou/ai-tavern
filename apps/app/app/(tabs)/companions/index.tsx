import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { CompanionCard } from '@/components/CompanionCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
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

  function openCompanion(id: string) {
    router.push(`/companion/${encodeURIComponent(id)}` as Href);
  }

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showQuota title="Companions" />
      <View className="mx-auto w-full max-w-4xl px-4 pt-4">
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
              <View key={companion.id} className="min-w-40 flex-1" style={{ flexBasis: '47%' }}>
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
