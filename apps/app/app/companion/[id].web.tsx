import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

import { deleteCompanion, mediaSource } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { DimensionBoard } from '@/components/DimensionBoard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { WebAppShell, WebInfoRow, WebPanel } from '@/components/web/WebAppShell';
import { useCompanion } from '@/hooks/use-companions';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { formatDateTime } from '@/utils/format';

export default function WebCompanionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const companionId = Array.isArray(id) ? id[0] : id;
  const { data, error, isLoading, refetch } = useCompanion(companionId);
  const { pushError } = useErrorBanner();

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

  const companion = data;
  const imageSource = mediaSource(companion.art_url);
  const canEdit = companion.source === 'user';

  async function removeCompanion() {
    if (!window.confirm(`Delete ${companion.name}? This will remove the custom companion from your list.`)) {
      return;
    }
    try {
      await deleteCompanion(companion.id);
      router.replace('/companions' as Href);
    } catch (nextError) {
      pushError(nextError instanceof Error ? nextError.message : 'Companion could not be deleted.');
    }
  }

  return (
    <WebAppShell
      actions={canEdit ? (
        <>
          <Button label="Edit" onPress={() => router.push(`/companion/${encodeURIComponent(companion.id)}/edit` as Href)} variant="secondary" />
          <Button label="Delete" onPress={() => void removeCompanion()} variant="danger" />
        </>
      ) : null}
      title={companion.name}
      subtitle={companion.relationship_role ?? 'Companion profile'}
    >
      <View className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <WebPanel>
          <View className="aspect-[4/5] items-center justify-end overflow-hidden rounded-lg border border-app-line bg-app-primarySoft">
            <View pointerEvents="none" style={portraitStyles.portraitFloor} />
            {imageSource ? (
              <Image accessibilityLabel={companion.name} resizeMode="contain" source={imageSource} style={portraitStyles.portraitImage} />
            ) : (
              <View className="h-full w-full items-center justify-center">
                <Text className="text-6xl font-semibold text-app-primary">{companion.name.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View className="mt-5 gap-2">
            <Text className="text-2xl font-semibold text-app-text">{companion.name}</Text>
            <Text className="text-sm uppercase tracking-normal text-app-muted">{companion.relationship_role}</Text>
            <Button label="Start chat" onPress={() => router.push(`/chat/${encodeURIComponent(companion.id)}` as Href)} />
          </View>
        </WebPanel>

        <View className="gap-6 xl:col-span-2">
          <DimensionBoard dimensions={companion.relationship.dimensions} level={companion.relationship.level} />
          <WebPanel>
            <Text className="mb-3 text-xl font-semibold text-app-text">Timeline</Text>
            <WebInfoRow label="First met" value={formatDateTime(companion.relationship.first_met_at)} />
            <WebInfoRow label="Last interaction" value={formatDateTime(companion.relationship.last_interaction_at)} />
          </WebPanel>
          <WebPanel>
            <Text className="mb-3 text-xl font-semibold text-app-text">Profile</Text>
            <TextBlock label="Personality" value={companion.personality} />
            <TextBlock label="Background" value={companion.background} />
            <TextBlock label="Appearance" value={companion.appearance} />
            <TextBlock label="Speech style" value={companion.speech_style} />
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
