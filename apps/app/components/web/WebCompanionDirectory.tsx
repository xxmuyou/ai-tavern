import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { CompanionListItem } from '@/api/types';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebButton, WebEmptyState, WebLoading, WebTabs, WebTag } from '@/components/web/ui';
import { useBilling } from '@/hooks/use-billing';
import { type CompanionSourceFilter, useCompanions } from '@/hooks/use-companions';
import { formatLevel } from '@/utils/format';

const FILTERS: { id: CompanionSourceFilter; label: string }[] = [
  { id: 'all', label: 'All companions' },
  { id: 'user', label: 'My companions' },
  { id: 'official', label: 'Official' },
];

type WebCompanionDirectoryProps = {
  subtitle?: string;
  title?: string;
};

export function WebCompanionDirectory({
  subtitle = 'Official cast and your own creations. Tap a card to step into their profile, story beats, and gallery.',
  title = 'Companions',
}: WebCompanionDirectoryProps) {
  const router = useRouter();
  const [source, setSource] = useState<CompanionSourceFilter>('all');
  const { data, error, isLoading, refetch } = useCompanions(source);
  const userCompanions = useCompanions('user');
  const billing = useBilling();

  function createCompanion() {
    const limit = billing.data?.entitlements.custom_companion_limit;
    const count = userCompanions.data?.items.length ?? 0;
    if (typeof limit === 'number' && count >= limit) {
      window.alert('Free accounts can create up to 3 custom companions. Upgrade to Pro for unlimited companion creation.');
      return;
    }
    router.push('/companion-create' as Href);
  }

  const items = data?.items ?? [];
  const customLimit = billing.data?.entitlements.custom_companion_limit;
  const customCount = userCompanions.data?.items.length ?? 0;

  return (
    <WebAppShell
      actions={<WebButton label="Create companion" onPress={createCompanion} variant="primary" />}
      title={title}
      subtitle={subtitle}
    >
      <View className="mb-8 flex-row flex-wrap items-center justify-between gap-4">
        <WebTabs
          active={source}
          onChange={(id) => setSource(id as CompanionSourceFilter)}
          tabs={FILTERS.map((f) => ({ id: f.id, label: f.label }))}
          variant="pill"
        />
        <View className="flex-row items-center gap-2 rounded-full border border-app-line bg-app-surface px-4 py-2 shadow-card">
          <View className="h-6 w-6 items-center justify-center rounded-full bg-ember-soft">
            <Ionicons color="#9A4318" name="sparkles-outline" size={12} />
          </View>
          <Text className="text-caption text-app-muted">{formatCompanionCount(customCount, customLimit)}</Text>
        </View>
      </View>

      {isLoading ? (
        <WebLoading fullscreen={false} label="Gathering the cast..." />
      ) : error ? (
        <WebEmptyState
          actionLabel="Try again"
          description="Companions could not be loaded."
          onAction={refetch}
          title="Companions unavailable"
        />
      ) : items.length === 0 ? (
        <WebEmptyState
          actionLabel="Refresh"
          description="No companions are active yet."
          onAction={refetch}
          title="No companions yet"
        />
      ) : (
        <View className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((companion) => (
            <CompanionTile
              key={companion.id}
              companion={companion}
              onPress={() => router.push(`/companion/${encodeURIComponent(companion.id)}` as Href)}
            />
          ))}
        </View>
      )}
    </WebAppShell>
  );
}

function formatCompanionCount(count: number, limit: number | null | undefined): string {
  if (limit === null) {
    return `${count} custom companions · unlimited`;
  }
  return `${count}/${limit ?? 3} custom companions`;
}

function CompanionTile({ companion, onPress }: { companion: CompanionListItem; onPress: () => void }) {
  const imageSource = mediaSource(companion.art_url);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className="group flex flex-col overflow-hidden rounded-2xl border border-app-line bg-app-surface shadow-card transition-shadow hover:shadow-float"
    >
      <View className="relative aspect-[4/5] items-center justify-end overflow-hidden bg-rose-soft">
        <View pointerEvents="none" style={tileStyles.portraitFloor} />
        {imageSource ? (
          <Image
            accessibilityLabel={companion.name}
            resizeMode="contain"
            source={imageSource}
            style={tileStyles.portraitImage}
          />
        ) : (
          <Text className="font-serif text-display-lg text-rose-deep/50">{companion.name.slice(0, 1).toUpperCase()}</Text>
        )}
        <View className="absolute left-3 top-3">
          <WebTag size="sm" variant={companion.source === 'user' ? 'ember' : 'rose'}>
            {companion.source === 'user' ? 'Yours' : 'Official'}
          </WebTag>
        </View>
        <View className="absolute right-3 top-3">
          <WebTag size="sm" variant="brand">
            {formatLevel(companion.current_level)}
          </WebTag>
        </View>
      </View>
      <View className="flex-1 gap-2 p-5">
        <Text className="font-serif text-title text-app-ink" numberOfLines={1}>{companion.name}</Text>
        {companion.relationship_role ? (
          <Text className="text-caption text-rose-deep" numberOfLines={1}>{companion.relationship_role}</Text>
        ) : null}
        <View className="mt-2 flex-row items-center gap-2 text-caption text-app-muted">
          <Ionicons color="#7A6A5E" name="chatbubble-ellipses-outline" size={12} />
          <Text className="text-caption text-app-muted">Tap to start a conversation</Text>
        </View>
      </View>
    </Pressable>
  );
}

const tileStyles = StyleSheet.create({
  portraitFloor: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    bottom: 0,
    height: 64,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  portraitImage: {
    height: '110%',
    transform: [{ translateY: 12 }],
    width: '110%',
  },
});
