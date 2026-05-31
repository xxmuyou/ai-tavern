import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import type { RelationshipDimensionKey, RelationshipDimensions } from '@/api/types';

const DIM_LABEL: Record<RelationshipDimensionKey, string> = {
  closeness: 'Closeness',
  trust: 'Trust',
  romance: 'Romance',
  friendship: 'Friendship',
  hostility: 'Hostility',
  tension: 'Tension',
  distance: 'Distance',
};

// Dimensions where a rise is a setback (the relationship pulling apart).
const NEGATIVE_DIMS: ReadonlySet<RelationshipDimensionKey> = new Set([
  'hostility',
  'tension',
  'distance',
]);

const VISIBLE_MS = 2800;
const MAX_ITEMS = 3;

type FeedbackItem = {
  key: RelationshipDimensionKey;
  label: string;
  positive: boolean;
};

function buildFeedbackItems(signals: Partial<RelationshipDimensions>): FeedbackItem[] {
  return (Object.entries(signals) as [RelationshipDimensionKey, number | undefined][])
    .filter(([, value]) => typeof value === 'number' && value !== 0)
    .map(([key, value]) => {
      const delta = value as number;
      // A rise in a "negative" dimension is bad; a rise elsewhere is good.
      const positive = NEGATIVE_DIMS.has(key) ? delta < 0 : delta > 0;
      const sign = delta > 0 ? '+' : '';
      return { key, label: `${DIM_LABEL[key]} ${sign}${delta}`, positive };
    })
    .sort((a, b) => Math.abs((signals[b.key] as number) ?? 0) - Math.abs((signals[a.key] as number) ?? 0))
    .slice(0, MAX_ITEMS);
}

/**
 * Ephemeral per-turn relationship feedback. `signals` is the dimension delta
 * pushed over SSE for the latest reply; `token` increments once per turn so the
 * chips re-appear even when two turns produce identical deltas. Self-clearing.
 */
export function SignalFeedback({
  signals,
  token,
}: {
  signals: Partial<RelationshipDimensions> | null;
  token: number;
}) {
  const [items, setItems] = useState<FeedbackItem[]>([]);

  useEffect(() => {
    if (!signals) {
      return;
    }
    const next = buildFeedbackItems(signals);
    if (next.length === 0) {
      return;
    }
    setItems(next);
    const id = globalThis.setTimeout(() => setItems([]), VISIBLE_MS);
    return () => globalThis.clearTimeout(id);
    // Re-run per turn via `token`; reading the latest `signals` is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (items.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="none" className="flex-row flex-wrap items-center justify-center gap-2 px-4 py-2">
      {items.map((item) => (
        <View
          key={item.key}
          className={`rounded-full px-3 py-1 ${item.positive ? 'bg-app-primarySoft' : 'bg-app-warning/15'}`}
        >
          <Text className={`text-xs font-semibold ${item.positive ? 'text-app-primary' : 'text-app-warning'}`}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
