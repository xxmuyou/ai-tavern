import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { CompanionListItem, Scene } from '@/api/types';

import { DiscoverCompanionCard } from '@/components/web/discover/DiscoverCompanionCard';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebButton, WebEmptyState, WebLoading, WebTabs, WebTag } from '@/components/web/ui';
import { PALETTE } from '@/constants/palette';
import { useBilling } from '@/hooks/use-billing';
import { type CompanionSourceFilter, useCompanions, usePublicCompanions } from '@/hooks/use-companions';
import { useScenes } from '@/hooks/use-scenes';
import { useSession } from '@/hooks/use-session';

const FILTERS: { id: CompanionSourceFilter; label: string }[] = [
  { id: 'all', label: 'All companions' },
  { id: 'user', label: 'My companions' },
  { id: 'official', label: 'Official' },
  { id: 'public', label: 'Public' },
];

type DiscoveryTopic = 'recommended' | 'official' | 'my' | 'relationship' | 'story' | 'scenes' | 'new';

const DISCOVERY_TOPICS: { id: DiscoveryTopic; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'recommended', label: 'Recommended', icon: 'sparkles-outline' },
  { id: 'official', label: 'Official', icon: 'ribbon-outline' },
  { id: 'my', label: 'My companions', icon: 'person-circle-outline' },
  { id: 'relationship', label: 'Relationship', icon: 'heart-outline' },
  { id: 'story', label: 'Story', icon: 'git-branch-outline' },
  { id: 'scenes', label: 'Scenes', icon: 'map-outline' },
  { id: 'new', label: 'New', icon: 'flash-outline' },
];

const DISCOVERY_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-9';
const SCENE_GRID_CLASS = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';

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
  const scenes = useScenes();
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
  const unlockedScenes = useMemo(
    () => (scenes.data?.scenes ?? []).filter((scene) => scene.unlocked),
    [scenes.data?.scenes],
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
                active ? 'border-app-rose/70 bg-app-canvas/70' : 'border-white/10 bg-white/[0.06] hover:bg-white/[0.075]'
              }`}
            >
              <Ionicons color={active ? '#FF8FAD' : '#7A6A5E'} name={item.icon} size={14} />
              <Text className={`text-caption font-semibold ${active ? 'text-rose-200' : 'text-rose-50/75'}`}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {topic === 'scenes' ? (
        scenes.isLoading ? (
          <WebLoading fullscreen={false} label="Checking unlocked scenes..." />
        ) : scenes.error ? (
          <WebEmptyState
            actionLabel="Try again"
            description="Unlocked scenes could not be loaded."
            onAction={scenes.refetch}
            title="Scenes unavailable"
          />
        ) : unlockedScenes.length === 0 ? (
          <WebEmptyState
            actionLabel="Refresh"
            description="No unlocked scenes yet. Grow relationships with companions to open new places."
            onAction={scenes.refetch}
            title="No unlocked scenes"
          />
        ) : (
          <View className="gap-5">
            <View className="flex-row flex-wrap items-end justify-between gap-3">
              <View>
                <Text className="text-overline text-app-rose-deep">Unlocked places</Text>
                <Text className="mt-1 font-serif text-title text-white">Scenes you can enter now</Text>
              </View>
              <Text className="text-caption text-rose-50/60">{unlockedScenes.length} unlocked</Text>
            </View>
            <View className={SCENE_GRID_CLASS}>
              {unlockedScenes.map((scene) => (
                <UnlockedSceneCard
                  key={scene.id}
                  scene={scene}
                  onPress={() => router.push(`/scene/${encodeURIComponent(scene.id)}` as Href)}
                />
              ))}
            </View>
          </View>
        )
      ) : isLoading ? (
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
        <View className={DISCOVERY_GRID_CLASS}>
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

function UnlockedSceneCard({ onPress, scene }: { onPress: () => void; scene: Scene }) {
  const imageSource = mediaSource(scene.art_url);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-app-surface shadow-card transition-all hover:border-app-rose/50 hover:shadow-glow"
    >
      <View className="relative aspect-[16/9] overflow-hidden bg-white/[0.075]">
        {imageSource ? (
          <Image accessibilityLabel={scene.name} source={imageSource} resizeMode="cover" className="h-full w-full" />
        ) : (
          <View className="h-full w-full items-center justify-center bg-gradient-warm">
            <Ionicons color={PALETTE.roseDeep} name="map-outline" size={34} />
          </View>
        )}
        <View className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-app-twilight/80 via-app-twilight/20 to-transparent" />
        <View className="absolute bottom-4 left-4 right-4 flex-row items-end justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-serif text-title-sm text-white">{scene.name}</Text>
            <Text numberOfLines={1} className="mt-1 text-caption text-white/75">{scene.mood}</Text>
          </View>
          <View className="rounded-full border border-white/10 bg-black/55 px-2.5 py-1 backdrop-blur">
            <Text className="text-[11px] font-semibold text-white">
              {scene.potential_companions.length} nearby
            </Text>
          </View>
        </View>
      </View>
      <View className="gap-3 p-4">
        {scene.tags.length ? (
          <View className="flex-row flex-wrap gap-1.5">
            {scene.tags.slice(0, 4).map((tag) => (
              <WebTag key={tag} variant="neutral" size="sm">{tag}</WebTag>
            ))}
          </View>
        ) : null}
        <View className="flex-row items-center justify-between border-t border-white/8 pt-3">
          <Text className="text-caption font-semibold text-rose-50/70">Tap to enter</Text>
          <Ionicons color={PALETTE.roseDeep} name="arrow-forward" size={16} />
        </View>
      </View>
    </Pressable>
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
