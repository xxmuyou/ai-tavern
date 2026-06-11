import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { MemoryCard } from '@/components/MemoryCard';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebCard, WebEmptyState, WebLoading, WebTag } from '@/components/web/ui';
import { useMemories } from '@/hooks/use-memories';

export default function WebMemoriesScreen() {
  const { companionId, portraitUrl } = useLocalSearchParams<{ companionId?: string; portraitUrl?: string }>();
  const id = typeof companionId === 'string' ? companionId : undefined;
  const portrait = typeof portraitUrl === 'string' ? portraitUrl : null;
  const { data, error, isLoading, refetch } = useMemories(id);

  if (isLoading) {
    return <WebLoading label="Curating the album..." />;
  }

  return (
    <WebAppShell title="Memory album" subtitle="Milestones, choices, and generated scene composites.">
      {data ? (
        <WebCard padding="lg">
          <View className="flex-row flex-wrap items-start justify-between gap-4">
            <View className="min-w-0 flex-1">
              <Text className="font-serif text-title text-white">
                {data.tier === 'pro' ? 'Unlimited album' : `${data.items.length}/${data.album_limit ?? 30} memories`}
              </Text>
              <Text className="mt-1 text-body-sm text-rose-50/60">
                {data.tier === 'pro'
                  ? 'Pro keeps the full relationship history.'
                  : 'Free albums keep the latest memories up to the plan limit.'}
              </Text>
            </View>
            <WebTag size="sm" variant={data.tier === 'pro' ? 'rose' : 'neutral'}>
              {data.tier === 'pro' ? 'Pro' : 'Free'}
            </WebTag>
          </View>
        </WebCard>
      ) : null}

      <View className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {error || !data ? (
          <WebEmptyState
            actionLabel="Try again"
            description="Memory album could not be loaded."
            icon="book-outline"
            onAction={refetch}
            title="Album unavailable"
          />
        ) : data.items.length ? (
          data.items.map((memory) => <MemoryCard key={memory.id} memory={memory} portraitUrl={portrait} />)
        ) : (
          <View className="xl:col-span-2">
            <WebEmptyState
              description="Milestones and completed activities will appear here."
              icon="albums-outline"
              title="No memories yet"
            />
          </View>
        )}
      </View>
    </WebAppShell>
  );
}
