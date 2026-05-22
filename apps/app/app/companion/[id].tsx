import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, ScrollView, Text, View } from 'react-native';

import { mediaUrl } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { DimensionBoard } from '@/components/DimensionBoard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { useCompanion } from '@/hooks/use-companions';
import { formatDateTime } from '@/utils/format';

export default function CompanionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const companionId = Array.isArray(id) ? id[0] : id;
  const { data, error, isLoading, refetch } = useCompanion(companionId);

  if (isLoading) {
    return <LoadingScreen label="Loading companion..." />;
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title="Companion" />
        <EmptyState
          actionLabel="Try again"
          description="The companion profile could not be loaded."
          onAction={refetch}
          title="Companion unavailable"
        />
      </View>
    );
  }

  const imageUrl = mediaUrl(data.art_url);

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showBack showQuota title={data.name} />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-4xl gap-5 px-4 py-6">
          <View className="rounded-lg border border-app-line bg-app-card p-5">
            <View className="flex-row gap-4">
              <View className="h-28 w-28 overflow-hidden rounded-lg bg-app-primarySoft">
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} resizeMode="cover" className="h-full w-full" />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Text className="text-5xl font-semibold text-app-primary">{data.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
              </View>
              <View className="min-w-0 flex-1 justify-center gap-2">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="text-3xl font-semibold text-app-text">{data.name}</Text>
                  <View className="rounded-full bg-app-primarySoft px-3 py-1">
                    <Text className="text-sm font-semibold text-app-primary">{data.relationship.level}</Text>
                  </View>
                </View>
                {data.relationship_role ? <Text className="text-sm uppercase tracking-normal text-app-muted">{data.relationship_role}</Text> : null}
                {data.personality ? <Text className="text-base leading-6 text-app-muted">{data.personality}</Text> : null}
              </View>
            </View>
          </View>

          <DimensionBoard dimensions={data.relationship.dimensions} level={data.relationship.level} />

          <View className="rounded-lg border border-app-line bg-app-card p-5">
            <Text className="text-lg font-semibold text-app-text">Timeline</Text>
            <View className="mt-4 gap-3">
              <InfoRow label="First met" value={formatDateTime(data.relationship.first_met_at)} />
              <InfoRow label="Last interaction" value={formatDateTime(data.relationship.last_interaction_at)} />
            </View>
          </View>

          {data.background || data.appearance || data.speech_style ? (
            <View className="rounded-lg border border-app-line bg-app-card p-5">
              <Text className="text-lg font-semibold text-app-text">Profile</Text>
              <View className="mt-4 gap-4">
                {data.background ? <TextBlock label="Background" value={data.background} /> : null}
                {data.appearance ? <TextBlock label="Appearance" value={data.appearance} /> : null}
                {data.speech_style ? <TextBlock label="Speech style" value={data.speech_style} /> : null}
              </View>
            </View>
          ) : null}

          <Button label="Start chat" onPress={() => router.push(`/chat/${encodeURIComponent(data.id)}` as Href)} />
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="text-sm text-app-muted">{label}</Text>
      <Text className="text-sm font-semibold text-app-text">{value}</Text>
    </View>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-sm font-semibold text-app-text">{label}</Text>
      <Text className="mt-1 text-sm leading-5 text-app-muted">{value}</Text>
    </View>
  );
}
