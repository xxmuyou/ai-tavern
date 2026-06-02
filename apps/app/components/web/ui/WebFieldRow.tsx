import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from './cn';

export type WebFieldRowProps = {
  className?: string;
  description?: string;
  label: string;
  trailing?: ReactNode;
  value?: ReactNode;
};

export function WebFieldRow({ className, description, label, trailing, value }: WebFieldRowProps) {
  return (
    <View className={cn('flex-row items-start justify-between gap-6 border-b border-app-line-soft py-3.5 last:border-b-0', className)}>
      <View className="min-w-0 flex-1">
        <Text className="text-body-sm font-semibold text-app-ink-soft">{label}</Text>
        {description ? <Text className="mt-0.5 text-caption text-app-muted">{description}</Text> : null}
      </View>
      {trailing ? (
        <View className="shrink-0 items-end">{trailing}</View>
      ) : typeof value === 'string' || typeof value === 'number' || value === null || value === undefined ? (
        <Text className="max-w-[60%] text-right text-body-sm text-app-ink">{value ?? '—'}</Text>
      ) : (
        <View className="max-w-[60%] items-end">{value}</View>
      )}
    </View>
  );
}
