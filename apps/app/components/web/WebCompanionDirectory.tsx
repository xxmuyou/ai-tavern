import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { DiscoverCompanionCard } from '@/components/web/discover/DiscoverCompanionCard';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebButton, WebEmptyState, WebLoading, WebTabs } from '@/components/web/ui';
import { PALETTE } from '@/constants/palette';
import { useBilling } from '@/hooks/use-billing';
import { type CompanionSourceFilter, useCompanions } from '@/hooks/use-companions';

const FILTERS: { id: CompanionSourceFilter; label: string }[] = [
  { id: 'all', label: 'All companions' },
  { id: 'user', label: 'My companions' },
  { id: 'official', label: 'Official' },
  { id: 'public', label: 'Public' },
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
          <View className="h-6 w-6 items-center justify-center rounded-full bg-app-ember-soft">
            <Ionicons color={PALETTE.ember} name="sparkles-outline" size={12} />
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
        <View className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((companion) => (
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

function formatCompanionCount(count: number, limit: number | null | undefined): string {
  if (limit === null) {
    return `${count} custom companions · unlimited`;
  }
  return `${count}/${limit ?? 3} custom companions`;
}
