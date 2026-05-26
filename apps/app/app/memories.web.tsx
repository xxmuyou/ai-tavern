import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { MemoryCard } from '@/components/MemoryCard';
import { WebAppShell, WebPanel } from '@/components/web/WebAppShell';
import { useMemories } from '@/hooks/use-memories';

export default function WebMemoriesScreen() {
  const { companionId, portraitUrl } = useLocalSearchParams<{ companionId?: string; portraitUrl?: string }>();
  const id = typeof companionId === 'string' ? companionId : undefined;
  const portrait = typeof portraitUrl === 'string' ? portraitUrl : null;
  const { data, error, isLoading, refetch } = useMemories(id);

  if (isLoading) {
    return <LoadingScreen label="Loading memories..." />;
  }

  return (
    <WebAppShell title="Memory album" subtitle="Milestones, choices, and generated scene composites.">
      {data ? (
        <WebPanel>
          <Text className="text-xl font-semibold text-app-text">
            {data.tier === 'pro' ? 'Unlimited album' : `${data.items.length}/${data.album_limit ?? 30} memories`}
          </Text>
          <Text className="mt-1 text-sm text-app-muted">
            {data.tier === 'pro' ? 'Pro keeps the full relationship history.' : 'Free albums keep the latest memories up to the plan limit.'}
          </Text>
        </WebPanel>
      ) : null}

      <View className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {error || !data ? (
          <EmptyState actionLabel="Try again" description="Memory album could not be loaded." onAction={refetch} title="Album unavailable" />
        ) : data.items.length ? (
          data.items.map((memory) => <MemoryCard key={memory.id} memory={memory} portraitUrl={portrait} />)
        ) : (
          <EmptyState description="Milestones and completed activities will appear here." title="No memories yet" />
        )}
      </View>
    </WebAppShell>
  );
}
