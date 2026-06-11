import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from './cn';

export type WebTimelineEntry = {
  body?: string;
  id: string;
  meta?: string;
  title: string;
};

export type WebTimelineProps = {
  className?: string;
  emptyLabel?: string;
  entries: WebTimelineEntry[];
  header?: ReactNode;
};

export function WebTimeline({ className, emptyLabel = 'Nothing here yet.', entries, header }: WebTimelineProps) {
  if (!entries.length) {
    return (
      <View className={cn('rounded-2xl border border-dashed border-white/10 bg-white/[0.055] px-6 py-10', className)}>
        <Text className="text-center text-body-sm text-rose-50/60">{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View className={cn('gap-5', className)}>
      {header}
      <View>
        {entries.map((entry, idx) => {
          const isLast = idx === entries.length - 1;
          return (
            <View key={entry.id} className="flex-row gap-5">
              <View className="items-center pt-1.5">
                <View className="h-2.5 w-2.5 rounded-full bg-app-rose" />
                {!isLast ? <View className="mt-1 h-full w-px flex-1 bg-app-line" /> : null}
              </View>
              <View className={cn('flex-1 pb-6', isLast && 'pb-0')}>
                <Text className="font-semibold text-white">{entry.title}</Text>
                {entry.meta ? <Text className="mt-0.5 text-caption text-rose-50/60">{entry.meta}</Text> : null}
                {entry.body ? (
                  <Text className="mt-2 text-body-sm leading-6 text-rose-50/75">{entry.body}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
