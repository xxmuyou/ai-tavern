import { Text, View } from 'react-native';

import type { RelationshipDimensions, RelationshipDimensionKey } from '@/api/types';

import { DimensionBar } from './DimensionBar';

const DIMENSIONS: { key: RelationshipDimensionKey; label: string; tone: 'positive' | 'negative' }[] = [
  { key: 'closeness', label: 'Closeness', tone: 'positive' },
  { key: 'trust', label: 'Trust', tone: 'positive' },
  { key: 'romance', label: 'Romance', tone: 'positive' },
  { key: 'friendship', label: 'Friendship', tone: 'positive' },
  { key: 'hostility', label: 'Hostility', tone: 'negative' },
  { key: 'tension', label: 'Tension', tone: 'negative' },
  { key: 'distance', label: 'Distance', tone: 'negative' },
];

type DimensionBoardProps = {
  dimensions: RelationshipDimensions;
  level: string;
};

export function DimensionBoard({ dimensions, level }: DimensionBoardProps) {
  return (
    <View className="rounded-lg border border-app-line bg-app-card p-5">
      <View className="mb-4 flex-row items-center justify-between gap-3">
        <Text className="text-lg font-semibold text-app-text">Relationship</Text>
        <View className="rounded-full bg-app-primarySoft px-3 py-1">
          <Text className="text-sm font-semibold text-app-primary">{level}</Text>
        </View>
      </View>
      <View className="gap-4">
        {DIMENSIONS.map((item) => (
          <DimensionBar
            key={item.key}
            dimension={item.key}
            label={item.label}
            tone={item.tone}
            value={dimensions[item.key] ?? 0}
          />
        ))}
      </View>
    </View>
  );
}
