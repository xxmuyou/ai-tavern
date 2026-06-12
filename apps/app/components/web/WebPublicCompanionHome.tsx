import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { API_BASE_URL, isApiRequestError } from '@/api/companion-client';
import type { CompanionListItem } from '@/api/types';
import { DiscoverCompanionCard } from '@/components/web/discover/DiscoverCompanionCard';
import { DiscoverRail, DiscoverSection } from '@/components/web/discover/DiscoverSection';
import { WebAppShell } from '@/components/web/WebAppShell';
import { BRAND_NAME, BRAND_TAGLINE } from '@/constants/brand';
import { PALETTE } from '@/constants/palette';
import { usePublicCompanions } from '@/hooks/use-companions';
import { useSession } from '@/hooks/use-session';

type GenderFilter = 'female' | 'male';

const GENDER_OPTIONS: { id: GenderFilter; label: string }[] = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
];

const COMMUNITY_PAGE_SIZE = 30;
const TOP_TAG_COUNT = 10;
const DISCOVERY_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-9';

export function WebPublicCompanionHome() {
  const router = useRouter();
  const { session } = useSession();
  const [gender, setGender] = useState<GenderFilter>('female');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [communityVisible, setCommunityVisible] = useState(COMMUNITY_PAGE_SIZE);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const popular = usePublicCompanions({
    gender,
    q: debouncedQuery || undefined,
    sort: 'popular',
  });
  const recent = usePublicCompanions({ gender, sort: 'recent' });

  const popularItems = useMemo(
    () => (popular.data?.items ?? []).filter((item) => item.art_url),
    [popular.data],
  );
  const recentItems = useMemo(
    () => (recent.data?.items ?? []).filter((item) => item.art_url),
    [recent.data],
  );

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of popularItems) {
      for (const tag of item.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_TAG_COUNT)
      .map(([tag]) => tag);
  }, [popularItems]);

  const isFiltering = Boolean(debouncedQuery || selectedTag);
  const filteredItems = useMemo(() => {
    if (!isFiltering) return [];
    if (selectedTag) return popularItems.filter((item) => (item.tags ?? []).includes(selectedTag));
    return popularItems;
  }, [isFiltering, popularItems, selectedTag]);

  const trending = popularItems.slice(0, 10);
  const newArrivals = recentItems.slice(0, 10);
  const officialPicks = popularItems.filter((item) => item.source === 'official').slice(0, 12);
  const community = popularItems.filter((item) => item.source === 'user');

  function openCompanion(companion: CompanionListItem) {
    const target = `/companion/${encodeURIComponent(companion.id)}` as Href;
    if (session) {
      router.push(target);
      return;
    }
    router.push(`/auth/login?redirect=${encodeURIComponent(String(target))}` as Href);
  }

  const renderCard = (companion: CompanionListItem) => (
    <DiscoverCompanionCard key={companion.id} companion={companion} onPress={() => openCompanion(companion)} />
  );

  return (
    <WebAppShell contentMode="immersive" requireAuth={false} title={BRAND_NAME}>
      <View className="h-full overflow-hidden bg-app-canvas">
        <View pointerEvents="none" className="absolute inset-0 bg-app-canvas" />
        <View pointerEvents="none" className="absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_at_top,rgba(255,77,126,0.16)_0%,rgba(80,28,82,0.12)_40%,transparent_72%)]" />
        <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-[360px] bg-[radial-gradient(ellipse_at_bottom,rgba(166,107,250,0.08)_0%,transparent_70%)]" />

        <ScrollView className="editorial-scroll h-full" contentContainerStyle={{ minHeight: '100%' }}>
          <View className="relative mx-auto w-full max-w-[1600px] px-8 pb-16 pt-8">
          {/* ── Hero ────────────────────────────────────────────── */}
          {!isFiltering ? (
            <View className="mb-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-hero px-10 py-12">
              <View pointerEvents="none" className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,77,126,0.22)_0%,transparent_55%)]" />
              <Text className="text-overline text-app-rose-deep">After dark, anyone can find you</Text>
              <Text className="mt-3 max-w-3xl font-serif text-display-lg leading-[1.08] text-app-ink">
                {BRAND_TAGLINE}
              </Text>
              <Text className="mt-4 max-w-xl text-body-lg leading-7 text-app-ink-soft">
                Pick a face, step into a scene, and see where the night takes you. A friend, a flame, family — or
                something a little more dangerous.
              </Text>
            </View>
          ) : null}

          {/* ── Filters ─────────────────────────────────────────── */}
          <View className="mb-8 gap-4">
            <View className="flex-row flex-wrap items-center gap-3">
              <View className="min-w-[260px] flex-1 flex-row items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5">
                <Ionicons color={PALETTE.muted} name="search-outline" size={16} />
                <TextInput
                  className="min-h-10 flex-1 text-body-sm text-app-ink"
                  placeholder="Search by name or vibe..."
                  placeholderTextColor={PALETTE.mutedSoft}
                  value={query}
                  onChangeText={setQuery}
                />
                {query ? (
                  <Pressable accessibilityRole="button" onPress={() => setQuery('')}>
                    <Ionicons color={PALETTE.muted} name="close-circle" size={16} />
                  </Pressable>
                ) : null}
              </View>
              <SegmentedControl
                options={GENDER_OPTIONS}
                value={gender}
                onChange={(value) => setGender(value as GenderFilter)}
              />
            </View>
            {topTags.length > 0 ? (
              <View className="flex-row flex-wrap items-center gap-2">
                {topTags.map((tag) => {
                  const active = tag === selectedTag;
                  return (
                    <Pressable
                      key={tag}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setSelectedTag(active ? null : tag)}
                      className={`rounded-full border px-3 py-1.5 transition-colors ${
                        active
                          ? 'border-app-rose/70 bg-app-canvas/70'
                          : 'border-white/10 bg-white/[0.04] hover:border-app-rose/40 hover:bg-app-rose-soft/50'
                      }`}
                    >
                      <Text className={`text-caption font-medium ${active ? 'text-app-rose-deep' : 'text-app-ink-soft'}`}>
                        #{tag}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* ── Body ────────────────────────────────────────────── */}
          {popular.isLoading ? (
            <DarkState icon="sparkles-outline" title="Opening the room..." />
          ) : popular.error ? (
            <DarkState
              actionLabel="Try again"
              description={getDiscoveryError(popular.error).description}
              icon="alert-circle-outline"
              onAction={popular.refetch}
              title={getDiscoveryError(popular.error).title}
            />
          ) : isFiltering ? (
            filteredItems.length === 0 ? (
              <DarkState
                actionLabel="Clear filters"
                description="No companions match this search yet. Try another name or tag."
                icon="moon-outline"
                onAction={() => {
                  setQuery('');
                  setSelectedTag(null);
                }}
                title="No one answers"
              />
            ) : (
              <DiscoverSection
                icon="search-outline"
                subtitle={`${filteredItems.length} found`}
                title={selectedTag ? `#${selectedTag}` : `Results for “${debouncedQuery}”`}
                actionLabel="Clear"
                onAction={() => {
                  setQuery('');
                  setSelectedTag(null);
                }}
              >
                <View className={DISCOVERY_GRID_CLASS}>
                  {filteredItems.map(renderCard)}
                </View>
              </DiscoverSection>
            )
          ) : popularItems.length === 0 ? (
            <DarkState
              description="No companions match this combination yet."
              icon="moon-outline"
              title="No one in this room"
            />
          ) : (
            <View className="gap-12">
              {trending.length > 0 ? (
                <DiscoverSection icon="flame" iconColor={PALETTE.ember} subtitle="Most played right now" title="Trending">
                  <DiscoverRail>
                    {trending.map((companion, index) => (
                      <DiscoverCompanionCard
                        key={companion.id}
                        companion={companion}
                        onPress={() => openCompanion(companion)}
                        rank={index + 1}
                        size="lg"
                      />
                    ))}
                  </DiscoverRail>
                </DiscoverSection>
              ) : null}

              {newArrivals.length > 0 ? (
                <DiscoverSection icon="sparkles" iconColor={PALETTE.brand} subtitle="Fresh faces" title="New arrivals">
                  <DiscoverRail>
                    {newArrivals.map((companion) => (
                      <DiscoverCompanionCard
                        key={companion.id}
                        companion={companion}
                        onPress={() => openCompanion(companion)}
                        size="lg"
                      />
                    ))}
                  </DiscoverRail>
                </DiscoverSection>
              ) : null}

              {officialPicks.length > 0 ? (
                <DiscoverSection icon="ribbon" subtitle="Curated by the house" title="Official picks">
                  <View className={DISCOVERY_GRID_CLASS}>
                    {officialPicks.map(renderCard)}
                  </View>
                </DiscoverSection>
              ) : null}

              {community.length > 0 ? (
                <DiscoverSection
                  icon="planet-outline"
                  iconColor={PALETTE.brand}
                  subtitle="Published by players"
                  title="Community creations"
                >
                  <View className={DISCOVERY_GRID_CLASS}>
                    {community.slice(0, communityVisible).map(renderCard)}
                  </View>
                  {community.length > communityVisible ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setCommunityVisible((count) => count + COMMUNITY_PAGE_SIZE)}
                      className="mt-2 min-h-11 items-center justify-center self-center rounded-xl border border-white/15 px-8 hover:border-app-rose/50 hover:bg-app-rose-soft/40"
                    >
                      <Text className="text-body-sm font-semibold text-app-ink-soft">
                        Show more ({community.length - communityVisible} left)
                      </Text>
                    </Pressable>
                  ) : null}
                </DiscoverSection>
              ) : null}
            </View>
          )}
          </View>
        </ScrollView>
      </View>
    </WebAppShell>
  );
}

function getDiscoveryError(error: Error | null): { description: string; title: string } {
  if (isApiRequestError(error) && error.code === 'api_unreachable' && API_BASE_URL.includes('127.0.0.1:8787')) {
    return {
      description: 'Start the local API with pnpm run:local:api, or use pnpm run:local to run the local API and web app together.',
      title: `Local API is not reachable at ${API_BASE_URL}`,
    };
  }
  return {
    description: 'The public companion list could not be loaded.',
    title: 'Discovery unavailable',
  };
}

function SegmentedControl({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  value: string;
}) {
  return (
    <View className="flex-row rounded-xl border border-white/10 bg-black/30 p-1">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.id)}
            className={`min-h-10 items-center justify-center rounded-lg border px-5 transition-colors ${
              active ? 'border-app-rose/70 bg-app-canvas/70' : 'border-transparent hover:bg-white/[0.06]'
            }`}
          >
            <Text className={`text-body-sm font-semibold ${active ? 'text-app-rose-deep' : 'text-app-ink-soft'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DarkState({
  actionLabel,
  description,
  icon,
  onAction,
  title,
}: {
  actionLabel?: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
  title: string;
}) {
  const isLoading = !actionLabel && !description;
  return (
    <View className="min-h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-8 py-16">
      <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl border border-app-rose/25 bg-app-rose-soft">
        {isLoading ? <ActivityIndicator color={PALETTE.roseDeep} /> : <Ionicons color={PALETTE.roseDeep} name={icon} size={24} />}
      </View>
      <Text className="text-center font-serif text-title text-app-ink">{title}</Text>
      {description ? (
        <Text className="mt-2 max-w-md text-center text-body-sm leading-6 text-app-muted">{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          className="mt-6 min-h-11 items-center justify-center rounded-xl bg-app-rose px-5 hover:shadow-glow"
        >
          <Text className="text-body-sm font-semibold text-white">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
