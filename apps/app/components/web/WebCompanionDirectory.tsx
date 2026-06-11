import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { CompanionListItem } from '@/api/types';

import { DiscoverCompanionCard } from '@/components/web/discover/DiscoverCompanionCard';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebButton, WebEmptyState, WebLoading, WebTabs } from '@/components/web/ui';
import { PALETTE } from '@/constants/palette';
import { useBilling } from '@/hooks/use-billing';
import { type CompanionSourceFilter, useCompanions, usePublicCompanions } from '@/hooks/use-companions';
import { useSession } from '@/hooks/use-session';

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
  subtitle = 'Official cast and your own creations. Open a profile, story beats, or gallery from one place.',
  title = 'Companions',
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
        <View className="flex-row items-center gap-2 rounded-full border border-app-line bg-app-surface px-4 py-2 shadow-card">
          <View className="h-6 w-6 items-center justify-center rounded-full bg-app-ember-soft">
            <Ionicons color={PALETTE.ember} name="sparkles-outline" size={12} />
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
        <View className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleItems.map((companion) => (
            <DiscoverCompanionCard
              key={companion.id}
              companion={companion}
              onPress={() => router.push(`/companion/${encodeURIComponent(companion.id)}` as Href)}
              topLeftLabel={companion.source === 'user' ? 'Yours' : 'Official'}
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
