import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { MemoryCard } from '@/components/MemoryCard';
import { useMemories } from '@/hooks/use-memories';

type CompanionMemoriesPreviewProps = {
  companionId: string;
  portraitUrl?: string | null;
};

export function CompanionMemoriesPreview({ companionId, portraitUrl }: CompanionMemoriesPreviewProps) {
  const router = useRouter();
  const { data, error, isLoading } = useMemories(companionId);
  const params = new URLSearchParams({ companionId });
  if (portraitUrl) params.set('portraitUrl', portraitUrl);

  return (
    <View className="gap-4 rounded-lg border border-app-line bg-app-card p-5">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-lg font-semibold text-app-text">Memories</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/memories?${params.toString()}` as Href)}>
          <Text className="text-sm font-semibold text-app-primary">View album</Text>
        </Pressable>
      </View>
      {isLoading ? (
        <Text className="text-sm text-app-muted">Loading memories...</Text>
      ) : error || !data ? (
        <Text className="text-sm text-app-muted">Memories could not be loaded.</Text>
      ) : data.items.length ? (
        <MemoryCard memory={data.items[0]} portraitUrl={portraitUrl} />
      ) : (
        <Text className="text-sm text-app-muted">Milestones and completed activities will appear here.</Text>
      )}
      {data?.tier === 'free' ? (
        <Text className="text-xs text-app-muted">{data.items.length}/{data.album_limit ?? 30} free album slots used.</Text>
      ) : data?.tier === 'pro' ? (
        <Text className="text-xs text-app-primary">Unlimited album enabled.</Text>
      ) : null}
    </View>
  );
}
