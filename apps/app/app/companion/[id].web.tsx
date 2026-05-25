import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { DimensionBoard } from '@/components/DimensionBoard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { WebAppShell, WebInfoRow, WebPanel } from '@/components/web/WebAppShell';
import { useCompanion } from '@/hooks/use-companions';
import { formatDateTime } from '@/utils/format';

export default function WebCompanionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const companionId = Array.isArray(id) ? id[0] : id;
  const { data, error, isLoading, refetch } = useCompanion(companionId);

  if (isLoading) {
    return <LoadingScreen label="Loading companion..." />;
  }

  if (error || !data) {
    return (
      <WebAppShell title="Companion" subtitle="This profile could not be loaded.">
        <EmptyState actionLabel="Try again" description="The companion profile could not be loaded." onAction={refetch} title="Companion unavailable" />
      </WebAppShell>
    );
  }

  const imageSource = mediaSource(data.art_url);

  return (
    <WebAppShell title={data.name} subtitle={data.relationship_role ?? 'Companion profile'}>
      <View className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <WebPanel>
          <View className="aspect-[4/5] items-center justify-end overflow-hidden rounded-lg border border-app-line bg-app-primarySoft">
            <View pointerEvents="none" style={portraitStyles.portraitFloor} />
            {imageSource ? (
              <Image accessibilityLabel={data.name} resizeMode="contain" source={imageSource} style={portraitStyles.portraitImage} />
            ) : (
              <View className="h-full w-full items-center justify-center">
                <Text className="text-6xl font-semibold text-app-primary">{data.name.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View className="mt-5 gap-2">
            <Text className="text-2xl font-semibold text-app-text">{data.name}</Text>
            <Text className="text-sm uppercase tracking-normal text-app-muted">{data.relationship_role}</Text>
            <Button label="Start chat" onPress={() => router.push(`/chat/${encodeURIComponent(data.id)}` as Href)} />
          </View>
        </WebPanel>

        <View className="gap-6 xl:col-span-2">
          <DimensionBoard dimensions={data.relationship.dimensions} level={data.relationship.level} />
          <WebPanel>
            <Text className="mb-3 text-xl font-semibold text-app-text">Timeline</Text>
            <WebInfoRow label="First met" value={formatDateTime(data.relationship.first_met_at)} />
            <WebInfoRow label="Last interaction" value={formatDateTime(data.relationship.last_interaction_at)} />
          </WebPanel>
          <WebPanel>
            <Text className="mb-3 text-xl font-semibold text-app-text">Profile</Text>
            <TextBlock label="Personality" value={data.personality} />
            <TextBlock label="Background" value={data.background} />
            <TextBlock label="Appearance" value={data.appearance} />
            <TextBlock label="Speech style" value={data.speech_style} />
          </WebPanel>
        </View>
      </View>
    </WebAppShell>
  );
}

const portraitStyles = StyleSheet.create({
  portraitFloor: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    bottom: 0,
    height: 58,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  portraitImage: {
    height: '112%',
    transform: [{ translateY: 9 }],
    width: '112%',
  },
});

function TextBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-app-text">{label}</Text>
      <Text className="mt-1 text-sm leading-6 text-app-muted">{value}</Text>
    </View>
  );
}
