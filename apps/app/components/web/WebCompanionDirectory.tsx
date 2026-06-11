import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { CompanionListItem } from '@/api/types';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebButton, WebEmptyState, WebLoading, WebTabs, WebTag } from '@/components/web/ui';
import { useBilling } from '@/hooks/use-billing';
import { type CompanionSourceFilter, useCompanions, usePublicCompanions } from '@/hooks/use-companions';
import { useSession } from '@/hooks/use-session';
import { formatLevel } from '@/utils/format';

const FILTERS: { id: CompanionSourceFilter; label: string }[] = [
  { id: 'all', label: 'All companions' },
  { id: 'user', label: 'My companions' },
  { id: 'official', label: 'Official' },
  { id: 'public', label: 'Public' },
];

type DiscoveryTopic = 'recommended' | 'official' | 'my' | 'relationship' | 'story' | 'new';

const DISCOVERY_TOPICS: { id: DiscoveryTopic; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'recommended', label: 'Recommended', icon: 'sparkles-outline' },
  { id: 'official', label: 'Official', icon: 'ribbon-outline' },
  { id: 'my', label: 'My companions', icon: 'person-circle-outline' },
  { id: 'relationship', label: 'Relationship', icon: 'heart-outline' },
  { id: 'story', label: 'Story', icon: 'git-branch-outline' },
  { id: 'new', label: 'New', icon: 'flash-outline' },
];

type WebCompanionDirectoryProps = {
  subtitle?: string;
  title?: string;
};

export function WebCompanionDirectory({
  subtitle = 'Find a character, open their profile, and start a private roleplay thread.',
  title = 'Discover',
}: WebCompanionDirectoryProps) {
  const router = useRouter();
  const [source, setSource] = useState<CompanionSourceFilter>('all');
  const [topic, setTopic] = useState<DiscoveryTopic>('recommended');
  const { isLoading: isSessionLoading, session } = useSession();
  const isSignedIn = Boolean(session);
  const authedCompanions = useCompanions(source, { enabled: isSignedIn });
  const publicCompanions = usePublicCompanions();
  const userCompanions = useCompanions('user', { enabled: isSignedIn });
  const billing = useBilling({ enabled: isSignedIn });
  const canUseAuthedData = isSignedIn && !isUnauthorizedError(authedCompanions.error);
  const data = canUseAuthedData ? authedCompanions.data : publicCompanions.data;
  const error = canUseAuthedData ? authedCompanions.error : publicCompanions.error;
  const isLoading = isSessionLoading || (canUseAuthedData ? authedCompanions.isLoading : publicCompanions.isLoading);
  const refetch = canUseAuthedData ? authedCompanions.refetch : publicCompanions.refetch;

  function createCompanion() {
    if (!canUseAuthedData) {
      router.push('/auth/login' as Href);
      return;
    }
    const limit = billing.data?.entitlements.custom_companion_limit;
    const count = userCompanions.data?.items.length ?? 0;
    if (typeof limit === 'number' && count >= limit) {
      window.alert('Free accounts can create up to 3 custom companions. Upgrade to Pro for unlimited companion creation.');
      return;
    }
    router.push('/companion-create' as Href);
  }

  const visibleItems = useMemo(
    () => filterDiscoveryItems(data?.items ?? [], topic, source, canUseAuthedData),
    [canUseAuthedData, data?.items, source, topic],
  );
  const customLimit = billing.data?.entitlements.custom_companion_limit;
  const customCount = userCompanions.data?.items.length ?? 0;

  return (
    <WebAppShell title={title} subtitle={subtitle}>
      <View className="mb-7 flex-row flex-wrap items-start justify-between gap-4">
        <View className="min-w-0 flex-1">
          <Text className="font-serif text-display-sm text-white">{title}</Text>
          <Text className="mt-2 max-w-2xl text-body-sm leading-6 text-rose-50/60">{subtitle}</Text>
        </View>
        <WebButton label="Create character" onPress={createCompanion} variant="primary" />
      </View>

      <View className="mb-8 flex-row flex-wrap items-center justify-between gap-4">
        <WebTabs
          active={source}
          onChange={(id) => {
            setSource(id as CompanionSourceFilter);
            setTopic('recommended');
          }}
          tabs={FILTERS.map((f) => ({ id: f.id, label: f.label }))}
          variant="pill"
        />
        <View className="flex-row items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 shadow-card">
          <View className="h-6 w-6 items-center justify-center rounded-full bg-ember-soft">
            <Ionicons color="#9A4318" name="sparkles-outline" size={12} />
          </View>
          <Text className="text-caption text-rose-50/60">{formatCompanionCount(customCount, customLimit, canUseAuthedData)}</Text>
        </View>
      </View>

      <View className="mb-8 flex-row flex-wrap gap-2">
        {DISCOVERY_TOPICS.map((item) => {
          const active = topic === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setTopic(item.id)}
              className={`min-h-10 flex-row items-center gap-2 rounded-full border px-4 ${
                active ? 'border-app-rose/35 bg-rose-300/12' : 'border-white/10 bg-white/[0.06] hover:bg-white/[0.075]'
              }`}
            >
              <Ionicons color={active ? '#9A2F4F' : '#7A6A5E'} name={item.icon} size={14} />
              <Text className={`text-caption font-semibold ${active ? 'text-rose-200' : 'text-rose-50/75'}`}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <WebLoading fullscreen={false} label="Gathering the cast..." />
      ) : error ? (
        <WebEmptyState
          actionLabel="Try again"
          description="The Discover cast could not be loaded."
          onAction={refetch}
          title="Discover unavailable"
        />
      ) : visibleItems.length === 0 ? (
        <WebEmptyState
          actionLabel="Refresh"
          description="No characters match this view yet."
          onAction={refetch}
          title="No characters yet"
        />
      ) : (
        <View className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((companion) => (
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

function formatCompanionCount(count: number, limit: number | null | undefined, isSignedIn: boolean): string {
  if (!isSignedIn) {
    return 'Sign in to create companions';
  }
  if (limit === null) {
    return `${count} custom companions · unlimited`;
  }
  return `${count}/${limit ?? 3} custom companions`;
}

function isUnauthorizedError(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 401;
}

function filterDiscoveryItems(
  items: CompanionListItem[],
  topic: DiscoveryTopic,
  source: CompanionSourceFilter,
  isSignedIn: boolean,
): CompanionListItem[] {
  if (!isSignedIn && (source === 'user' || source === 'favorites')) {
    return [];
  }
  switch (topic) {
    case 'official':
      return items.filter((item) => item.source === 'official');
    case 'my':
      return items.filter((item) => item.source === 'user');
    case 'relationship':
      return items.filter((item) => Boolean(item.relationship_role));
    case 'story':
      return items.filter((item) => item.preferred_scenes.length > 0 || item.tags.length > 0);
    case 'new':
      return [...items].sort((a, b) => (b.last_interaction_at ?? 0) - (a.last_interaction_at ?? 0));
    case 'recommended':
    default:
      return [...items].sort((a, b) => (b.play_count ?? 0) - (a.play_count ?? 0));
  }
}

function CompanionTile({ companion, onPress }: { companion: CompanionListItem; onPress: () => void }) {
  const imageSource = mediaSource(companion.art_url);
  const tags = companion.tags.slice(0, 3);
  const intro = companion.relationship_role
    ?? tags[0]
    ?? (companion.source === 'user' ? 'Your custom companion' : 'Ready for a private conversation');
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-card transition-shadow hover:shadow-float"
    >
      <View className="relative aspect-[4/5] items-center justify-end overflow-hidden bg-rose-300/12">
        <View pointerEvents="none" style={tileStyles.portraitFloor} />
        {imageSource ? (
          <Image
            accessibilityLabel={companion.name}
            resizeMode="contain"
            source={imageSource}
            style={tileStyles.portraitImage}
          />
        ) : (
          <Text className="font-serif text-display-lg text-rose-200/50">{companion.name.slice(0, 1).toUpperCase()}</Text>
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
      <View className="flex-1 gap-3 p-5">
        <Text className="font-serif text-title text-white" numberOfLines={1}>{companion.name}</Text>
        <Text className="text-body-sm leading-5 text-rose-50/60" numberOfLines={2}>{intro}</Text>
        {tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">
            {tags.map((tag) => (
              <WebTag key={tag} size="sm" variant="neutral">{tag}</WebTag>
            ))}
          </View>
        ) : null}
        <View className="mt-auto flex-row items-center justify-between gap-3 pt-2">
          <View className="flex-row items-center gap-2">
            <Ionicons color="#7A6A5E" name="chatbubble-ellipses-outline" size={12} />
            <Text className="text-caption text-rose-50/60">{formatPlayCount(companion.play_count)}</Text>
          </View>
          <View className="rounded-full bg-rose-300/12 px-4 py-2">
            <Text className="text-caption font-semibold text-rose-200">Chat</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function formatPlayCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M chats`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K chats`;
  return `${count} chats`;
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
