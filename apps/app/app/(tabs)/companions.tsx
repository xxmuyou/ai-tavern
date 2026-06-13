import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { favoriteCompanion } from '@/api/companion-client';
import { CompanionCard } from '@/components/CompanionCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { useBilling } from '@/hooks/use-billing';
import { type CompanionSort, type CompanionSourceFilter, useCompanions } from '@/hooks/use-companions';

const FILTERS: { label: string; value: CompanionSourceFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Mine', value: 'user' },
  { label: 'Official', value: 'official' },
  { label: 'Public', value: 'public' },
  { label: 'Saved', value: 'favorites' },
];

const SORTS: { label: string; value: CompanionSort }[] = [
  { label: 'Recent', value: 'recent' },
  { label: 'Popular', value: 'popular' },
];

export default function CompanionsScreen() {
  const router = useRouter();
  const [source, setSource] = useState<CompanionSourceFilter>('all');
  const [sort, setSort] = useState<CompanionSort>('recent');
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const { data, error, isLoading, refetch } = useCompanions(source, { q: query, sort });
  const userCompanions = useCompanions('user');
  const billing = useBilling();

  async function toggleFavorite(id: string, next: boolean) {
    try {
      await favoriteCompanion(id, next);
      await refetch();
    } catch {
      // best-effort; a failed toggle just leaves the heart as-is
    }
  }

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
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Import character card"
              onPress={() => router.push('/companion-import' as Href)}
              className="h-10 w-10 items-center justify-center rounded-lg border border-app-line bg-app-card"
            >
              <Ionicons color="#687076" name="download-outline" size={20} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={createCompanion} className="h-10 w-10 items-center justify-center rounded-lg bg-app-primary">
              <Ionicons color="#FFFFFF" name="add" size={22} />
            </Pressable>
          </View>
        )}
        showQuota
        title="Companions"
      />
      <View className="mx-auto w-full max-w-4xl px-4 pt-4">
        <Text className="mb-3 text-sm font-semibold text-app-muted">
          {formatCompanionCount(userCompanions.data?.items.length ?? 0, billing.data?.entitlements.custom_companion_limit)}
        </Text>
        <View className="mb-3 flex-row items-center gap-2 rounded-lg border border-app-line bg-app-sunken px-3">
          <Ionicons color="#687076" name="search" size={16} />
          <TextInput
            className="flex-1 py-2.5 text-base text-app-text"
            placeholder="Search by name or tag"
            placeholderTextColor="#687076"
            value={queryDraft}
            onChangeText={setQueryDraft}
            onSubmitEditing={() => setQuery(queryDraft.trim())}
            returnKeyType="search"
          />
          {queryDraft.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setQueryDraft('');
                setQuery('');
              }}
            >
              <Ionicons color="#687076" name="close-circle" size={18} />
            </Pressable>
          ) : null}
        </View>

        <View className="flex-row rounded-lg border border-app-line bg-app-card p-1">
          {FILTERS.map((filter) => {
            const isActive = filter.value === source;
            return (
              <Pressable
                key={filter.value}
                accessibilityRole="button"
                onPress={() => setSource(filter.value)}
                className={`min-h-10 flex-1 items-center justify-center rounded-md px-2 ${isActive ? 'bg-app-primary' : 'bg-transparent'}`}
              >
                <Text className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-app-muted'}`}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View className="mt-2 flex-row items-center gap-2">
          <Text className="text-xs text-app-muted">Sort</Text>
          {SORTS.map((option) => {
            const isActive = option.value === sort;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                onPress={() => setSort(option.value)}
                className={`rounded-full border px-3 py-1 ${isActive ? 'border-app-primary bg-app-primarySoft' : 'border-app-line bg-app-sunken'}`}
              >
                <Text className={`text-xs font-semibold ${isActive ? 'text-app-primary' : 'text-app-muted'}`}>{option.label}</Text>
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
          description={
            query
              ? 'No companions match your search.'
              : source === 'user'
                ? 'You do not have custom companions yet.'
                : source === 'favorites'
                  ? 'Tap the heart on a companion to save it here.'
                  : 'No companions are active yet.'
          }
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
                  tags={companion.tags}
                  isFavorite={companion.is_favorite}
                  onToggleFavorite={() => void toggleFavorite(companion.id, !companion.is_favorite)}
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
