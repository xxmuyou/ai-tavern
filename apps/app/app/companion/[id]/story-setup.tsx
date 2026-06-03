import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { CompanionStoryPanel } from '@/components/CompanionStoryPanel';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { useCompanion } from '@/hooks/use-companions';

export default function CompanionStorySetupScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const companionId = Array.isArray(id) ? id[0] : id;
  const companion = useCompanion(companionId);

  if (companion.isLoading) {
    return <LoadingScreen label="Loading companion..." />;
  }

  if (companion.error || !companion.data) {
    return (
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title="Set up story" />
        <EmptyState
          actionLabel="Go back"
          description="This companion could not be loaded."
          onAction={() => router.back()}
          title="Story setup unavailable"
        />
      </View>
    );
  }

  const detail = companion.data;

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showBack showQuota title="Set up story" />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-4xl gap-5 px-4 py-6">
          <View className="rounded-lg border border-app-line bg-app-card p-5">
            <Text className="text-2xl font-semibold text-app-text">{detail.name}</Text>
            <Text className="mt-2 text-sm leading-5 text-app-muted">
              Choose a story pack, write a short arc, or draft one with AI. You can skip this and keep sandbox chat available.
            </Text>
          </View>

          <CompanionStoryPanel
            canEdit
            companionId={detail.id}
            onChanged={companion.refetch}
          />

          <View className="gap-3">
            <Button
              label="Start chat"
              onPress={() => router.replace(`/chat/${encodeURIComponent(detail.id)}` as Href)}
            />
            <Button
              label="Open profile"
              onPress={() => router.replace(`/companion/${encodeURIComponent(detail.id)}` as Href)}
              variant="secondary"
            />
            <Button
              label="Skip for now"
              onPress={() => router.replace(`/companion/${encodeURIComponent(detail.id)}` as Href)}
              variant="secondary"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
