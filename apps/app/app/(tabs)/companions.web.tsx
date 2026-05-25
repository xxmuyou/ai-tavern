import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { CompanionListItem } from '@/api/types';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { WebAppShell } from '@/components/web/WebAppShell';
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

  if (isLoading) {
    return <LoadingScreen label="Loading companions..." />;
  }

  return (
    <WebAppShell title="Companions" subtitle="Scan official and custom companions with desktop-density cards.">
      <View className="mb-6 flex-row gap-2">
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

function CompanionTile({ companion, onPress }: { companion: CompanionListItem; onPress: () => void }) {
  const imageSource = mediaSource(companion.art_url);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="min-w-[220px] flex-1 rounded-lg border border-app-line bg-white p-4">
      <View className="aspect-[4/5] items-center justify-end overflow-hidden rounded-lg border border-app-line bg-app-primarySoft">
        {imageSource ? (
          <Image accessibilityLabel={companion.name} resizeMode="contain" source={imageSource} className="h-[108%] w-[108%]" />
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
