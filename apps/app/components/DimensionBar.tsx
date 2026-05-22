import { Text, View } from 'react-native';

import type { RelationshipDimensionKey } from '@/api/types';

type DimensionBarProps = {
  dimension: RelationshipDimensionKey;
  label: string;
  tone: 'positive' | 'negative';
  value: number;
};

export function DimensionBar({ dimension, label, tone, value }: DimensionBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const fillColor = tone === 'positive' ? positiveColor(dimension) : negativeColor(dimension);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-sm font-semibold text-app-text">{label}</Text>
        <Text className="text-sm tabular-nums text-app-muted">{clamped}</Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-app-line">
        <View className="h-full rounded-full" style={{ backgroundColor: fillColor, width: `${clamped}%` }} />
      </View>
    </View>
  );
}

function positiveColor(dimension: RelationshipDimensionKey): string {
  if (dimension === 'romance') return '#B65C3A';
  if (dimension === 'friendship') return '#C87918';
  return '#1E6B52';
}

function negativeColor(dimension: RelationshipDimensionKey): string {
  if (dimension === 'hostility') return '#7C3AED';
  if (dimension === 'tension') return '#2563EB';
  return '#475569';
}
