import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { favoriteCompanion, mediaSource } from '@/api/companion-client';
import type { Scene } from '@/api/types';

import { DiscoverCompanionCard } from '@/components/web/discover/DiscoverCompanionCard';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebButton, WebEmptyState, WebLoading, WebTabs, WebTag } from '@/components/web/ui';
import { useBilling } from '@/hooks/use-billing';
import { type CompanionSourceFilter, useCompanions } from '@/hooks/use-companions';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useScenes } from '@/hooks/use-scenes';
import { useSession } from '@/hooks/use-session';

type CompanionDirectoryTab = CompanionSourceFilter | 'scenes';

const FILTERS: { id: CompanionDirectoryTab; label: string }[] = [
  { id: 'favorites', label: 'Favorites' },
  { id: 'user', label: 'My creations' },
  { id: 'official', label: 'Official' },
  { id: 'scenes', label: 'Scenes' },
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
  const { pushError } = useErrorBanner();
  const [source, setSource] = useState<CompanionDirectoryTab>('favorites');
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const { isLoading: isSessionLoading, session } = useSession();
  const isSignedIn = Boolean(session);
  const companionSource = source === 'scenes' ? 'favorites' : source;
  const companions = useCompanions(companionSource, { enabled: isSignedIn && source !== 'scenes' });
  const userCompanions = useCompanions('user', { enabled: isSignedIn });
  const scenes = useScenes({ enabled: isSignedIn });
  const billing = useBilling({ enabled: isSignedIn });
  const isLoading = isSessionLoading || (source === 'scenes' ? scenes.isLoading : companions.isLoading);

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
            setSource(id as CompanionDirectoryTab);
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
      ) : source === 'scenes' ? (
        <SceneDirectory
          error={scenes.error}
          onLockedScene={(scene) => pushError(formatUnlockHint(scene.unlock_hint) || 'This scene is still locked.')}
          onOpenScene={(scene) => router.push(`/scene/${encodeURIComponent(scene.id)}` as Href)}
          onRefresh={scenes.refetch}
          scenes={scenes.data?.scenes ?? []}
        />
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

function SceneDirectory({
  error,
  onLockedScene,
  onOpenScene,
  onRefresh,
  scenes,
}: {
  error: Error | null;
  onLockedScene: (scene: Scene) => void;
  onOpenScene: (scene: Scene) => void;
  onRefresh: () => void;
  scenes: Scene[];
}) {
  const unlocked = scenes.filter((scene) => scene.unlocked);
  const locked = scenes.filter((scene) => !scene.unlocked);

  if (error) {
    return (
      <WebEmptyState
        actionLabel="Try again"
        description="Scene data could not be loaded."
        onAction={onRefresh}
        title="Scenes unavailable"
      />
    );
  }

  if (scenes.length === 0) {
    return (
      <WebEmptyState
        actionLabel="Refresh"
        description="No scenes are active yet."
        onAction={onRefresh}
        title="No scenes yet"
      />
    );
  }

  return (
    <View className="gap-10">
      {unlocked.length > 0 ? (
        <View className="gap-4">
          <View>
            <Text className="text-overline text-app-rose-deep">Unlocked</Text>
            <Text className="mt-1 font-serif text-title-sm text-white">Scenes you can enter</Text>
          </View>
          <View className={DISCOVERY_GRID_CLASS}>
            {unlocked.map((scene) => (
              <SceneDirectoryCard key={scene.id} scene={scene} onPress={() => onOpenScene(scene)} />
            ))}
          </View>
        </View>
      ) : null}

      {locked.length > 0 ? (
        <View className="gap-4">
          <View>
            <Text className="text-overline text-rose-50/60">Locked</Text>
            <Text className="mt-1 font-serif text-title-sm text-white">Scenes waiting for a relationship</Text>
          </View>
          <View className={DISCOVERY_GRID_CLASS}>
            {locked.map((scene) => (
              <SceneDirectoryCard key={scene.id} scene={scene} onPress={() => onLockedScene(scene)} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SceneDirectoryCard({ onPress, scene }: { onPress: () => void; scene: Scene }) {
  const imageSource = mediaSource(scene.art_url);
  const hint = formatUnlockHint(scene.unlock_hint);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`overflow-hidden rounded-xl border bg-white/[0.04] transition-colors ${
        scene.unlocked ? 'border-white/10 hover:border-app-rose/50' : 'border-white/10 opacity-80 hover:border-app-ember/50'
      }`}
    >
      <View className="relative aspect-[4/5] overflow-hidden bg-white/[0.06]">
        {imageSource ? (
          <Image accessibilityLabel={scene.name} source={imageSource} resizeMode="cover" className="h-full w-full" />
        ) : (
          <View className="h-full w-full items-center justify-center bg-app-rose-soft">
            <Ionicons color="#FF8FAD" name="map-outline" size={28} />
          </View>
        )}
        {!scene.unlocked ? <View pointerEvents="none" className="absolute inset-0 bg-black/45" /> : null}
        <View className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
        <View className="absolute left-3 right-3 bottom-3">
          <Text className="font-serif text-title-sm text-white" numberOfLines={1}>{scene.name}</Text>
          <Text className="mt-1 text-caption text-white/75" numberOfLines={2}>{scene.mood}</Text>
        </View>
        <View className="absolute right-3 top-3 flex-row items-center gap-1 rounded-full bg-black/65 px-2.5 py-1">
          <Ionicons color={scene.unlocked ? '#8EF0BD' : '#FFB066'} name={scene.unlocked ? 'lock-open-outline' : 'lock-closed'} size={12} />
          <Text className="text-caption font-semibold text-white">{scene.unlocked ? 'Open' : 'Locked'}</Text>
        </View>
      </View>
      <View className="gap-3 p-3">
        {scene.tags.length ? (
          <View className="flex-row flex-wrap gap-1.5">
            {scene.tags.slice(0, 3).map((tag) => (
              <WebTag key={tag} size="sm" variant="neutral">
                {tag}
              </WebTag>
            ))}
          </View>
        ) : null}
        <Text className="text-caption text-rose-50/60" numberOfLines={2}>
          {scene.unlocked
            ? `${scene.potential_companions.length} companion${scene.potential_companions.length === 1 ? '' : 's'} nearby`
            : hint || 'Reach a relationship threshold'}
        </Text>
      </View>
    </Pressable>
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

function formatUnlockHint(hint: Scene['unlock_hint']): string {
  if (!hint) return '';
  if (typeof hint === 'string') return hint;
  const dimension = hint.dimension ? hint.dimension.replace(/_/g, ' ') : 'relationship';
  return `Reach ${dimension} ${hint.value ?? 0} with any companion`;
}

function formatCompanionCount(count: number, limit: number | null | undefined): string {
  if (limit === null) {
    return `${count} custom companions · unlimited`;
  }
  return `${count}/${limit ?? 3} custom companions`;
}
