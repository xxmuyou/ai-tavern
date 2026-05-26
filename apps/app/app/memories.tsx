import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { MemoryCard } from '@/components/MemoryCard';
import { TopBar } from '@/components/TopBar';
import { useMemories } from '@/hooks/use-memories';

export default function MemoriesScreen() {
  const { companionId, portraitUrl } = useLocalSearchParams<{ companionId?: string; portraitUrl?: string }>();
  const id = typeof companionId === 'string' ? companionId : undefined;
  const portrait = typeof portraitUrl === 'string' ? portraitUrl : null;
  const { data, error, isLoading, refetch } = useMemories(id);

  if (isLoading) {
    return <LoadingScreen label="Loading memories..." />;
  }

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showBack showQuota title="Memory album" />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-4xl gap-4 px-4 py-6">
          {data ? (
            <View className="rounded-lg border border-app-line bg-app-card p-4">
              <Text className="text-lg font-semibold text-app-text">
                {data.tier === 'pro' ? 'Unlimited album' : `${data.items.length}/${data.album_limit ?? 30} memories`}
              </Text>
              {data.tier === 'free' ? (
                <Text className="mt-1 text-sm text-app-muted">Free albums keep the latest memories up to the plan limit.</Text>
              ) : (
                <Text className="mt-1 text-sm text-app-muted">Pro keeps your full relationship history.</Text>
              )}
            </View>
          ) : null}

          {error || !data ? (
            <EmptyState actionLabel="Try again" description="Memory album could not be loaded." onAction={refetch} title="Album unavailable" />
          ) : data.items.length ? (
            data.items.map((memory) => <MemoryCard key={memory.id} memory={memory} portraitUrl={portrait} />)
          ) : (
            <EmptyState description="Milestones and completed activities will appear here." title="No memories yet" />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
