import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { favoriteCompanion } from '@/api/companion-client';

import { DiscoverCompanionCard } from '@/components/web/discover/DiscoverCompanionCard';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebButton, WebEmptyState, WebLoading, WebTabs } from '@/components/web/ui';
import { useBilling } from '@/hooks/use-billing';
import { type CompanionSourceFilter, useCompanions } from '@/hooks/use-companions';
import { useSession } from '@/hooks/use-session';

const FILTERS: { id: CompanionSourceFilter; label: string }[] = [
  { id: 'favorites', label: 'Favorites' },
  { id: 'user', label: 'My creations' },
  { id: 'official', label: 'Official' },
];

const DISCOVERY_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-9';

type WebCompanionDirectoryProps = {
  subtitle?: string;
  title?: string;
};

export function WebCompanionDirectory({
  subtitle = 'Your saved cast, your own creations, and the official companions you can add to favorites.',
  title = 'Companions',
}: WebCompanionDirectoryProps) {
  const router = useRouter();
  const [source, setSource] = useState<CompanionSourceFilter>('favorites');
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const { isLoading: isSessionLoading, session } = useSession();
  const isSignedIn = Boolean(session);
  const companions = useCompanions(source, { enabled: isSignedIn });
  const userCompanions = useCompanions('user', { enabled: isSignedIn });
  const billing = useBilling({ enabled: isSignedIn });
  const isLoading = isSessionLoading || companions.isLoading;

  function createCompanion() {
    const limit = billing.data?.entitlements.custom_companion_limit;
    const count = userCompanions.data?.items.length ?? 0;
    if (typeof limit === 'number' && count >= limit) {
      window.alert('Free accounts can create up to 3 custom companions. Upgrade to Pro for unlimited companion creation.');
      return;
    }
    router.push('/companion-create' as Href);
  }

  async function toggleFavorite(id: string, next: boolean) {
    if (favoriteBusyId) return;
    setFavoriteBusyId(id);
    try {
      await favoriteCompanion(id, next);
      await companions.refetch();
    } finally {
      setFavoriteBusyId(null);
    }
  }

  const customLimit = billing.data?.entitlements.custom_companion_limit;
  const customCount = userCompanions.data?.items.length ?? 0;

  if (isSessionLoading) {
    return (
      <WebAppShell hideChrome requireAuth={false} title={title}>
        <WebLoading fullscreen={false} label="Checking your session..." />
      </WebAppShell>
    );
  }

  if (!isSignedIn) {
    return (
      <WebAppShell hideChrome requireAuth={false} title={title}>
        <View className="min-h-[70vh] items-center justify-center">
          <View className="w-full max-w-md items-center gap-5 rounded-2xl border border-white/10 bg-app-surface px-8 py-10 shadow-card">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-app-rose-soft">
              <Ionicons color="#FF8FAD" name="heart-outline" size={22} />
            </View>
            <View className="items-center gap-2">
              <Text className="font-serif text-title text-white">Sign in to view companions</Text>
              <Text className="text-center text-body-sm leading-6 text-rose-50/60">
                Your favorites and creations live in your private companion library.
              </Text>
            </View>
            <WebButton
              label="Sign in"
              onPress={() => router.push(`/auth/login?redirect=${encodeURIComponent('/companions')}` as Href)}
              variant="primary"
            />
          </View>
        </View>
      </WebAppShell>
    );
  }

  return (
    <WebAppShell requireAuth={false} title={title} subtitle={subtitle}>
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
          }}
          tabs={FILTERS.map((f) => ({ id: f.id, label: f.label }))}
          variant="pill"
        />
        <View className="flex-row items-center gap-2 rounded-full border border-app-line bg-app-surface px-4 py-2 shadow-card">
          <View className="h-6 w-6 items-center justify-center rounded-full bg-app-ember-soft">
            <Ionicons color="#FF9D5C" name="sparkles-outline" size={12} />
          </View>
          <Text className="text-caption text-rose-50/60">{formatCompanionCount(customCount, customLimit)}</Text>
        </View>
      </View>

      {isLoading ? (
        <WebLoading fullscreen={false} label="Gathering the cast..." />
      ) : companions.error ? (
        <WebEmptyState
          actionLabel="Try again"
          description="Your companion library could not be loaded."
          onAction={companions.refetch}
          title="Companions unavailable"
        />
      ) : (companions.data?.items ?? []).length === 0 ? (
        <EmptyLibraryState onCreate={createCompanion} onRefresh={companions.refetch} source={source} />
      ) : (
        <View className={DISCOVERY_GRID_CLASS}>
          {(companions.data?.items ?? []).map((companion) => (
            <DiscoverCompanionCard
              key={companion.id}
              companion={companion}
              isFavorite={companion.is_favorite}
              onPress={() => router.push(`/companion/${encodeURIComponent(companion.id)}` as Href)}
              onToggleFavorite={() => void toggleFavorite(companion.id, !companion.is_favorite)}
              topLeftLabel={companion.source === 'user' ? 'Yours' : 'Official'}
            />
          ))}
        </View>
      )}
    </WebAppShell>
  );
}

function EmptyLibraryState({
  onCreate,
  onRefresh,
  source,
}: {
  onCreate: () => void;
  onRefresh: () => void;
  source: CompanionSourceFilter;
}) {
  if (source === 'favorites') {
    return (
      <WebEmptyState
        actionLabel="Refresh"
        description="Save companions from Official or a profile page, then they will appear here."
        onAction={onRefresh}
        title="No favorites yet"
      />
    );
  }
  if (source === 'user') {
    return (
      <WebEmptyState
        actionLabel="Create character"
        description="Create a custom companion to see them in your personal library."
        onAction={onCreate}
        title="No creations yet"
      />
    );
  }
  return (
    <WebEmptyState
      actionLabel="Refresh"
      description="Official companions could not be found right now."
      onAction={onRefresh}
      title="No official companions"
    />
  );
}

function formatCompanionCount(count: number, limit: number | null | undefined): string {
  if (limit === null) {
    return `${count} custom companions · unlimited`;
  }
  return `${count}/${limit ?? 3} custom companions`;
}
