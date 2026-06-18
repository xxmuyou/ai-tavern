import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { PALETTE } from '@/constants/palette';

import { cn } from '../ui/cn';

export type DiscoverSectionProps = {
  actionLabel?: string;
  children: ReactNode;
  className?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onAction?: () => void;
  subtitle?: string;
  title: string;
};

export function DiscoverSection({
  actionLabel,
  children,
  className,
  icon,
  iconColor = PALETTE.rose,
  onAction,
  subtitle,
  title,
}: DiscoverSectionProps) {
  return (
    <View className={cn('gap-4', className)}>
      <View className="min-w-0 flex-row items-end justify-between gap-4">
        <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
          <View className="shrink-0">
            <Ionicons color={iconColor} name={icon} size={20} />
          </View>
          <Text numberOfLines={1} className="min-w-0 shrink font-serif text-title-sm text-app-ink">{title}</Text>
          {subtitle ? <Text numberOfLines={1} className="shrink-0 text-caption text-app-muted">{subtitle}</Text> : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} className="shrink-0 flex-row items-center gap-1">
            <Text className="text-body-sm font-semibold text-app-rose-deep">{actionLabel}</Text>
            <Ionicons color={PALETTE.roseDeep} name="arrow-forward" size={14} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Horizontal card rail with right-edge fade hint. */
export function DiscoverRail({ children }: { children: ReactNode }) {
  return (
    <View className="relative -mx-1">
      <ScrollView
        horizontal
        className="editorial-scroll"
        contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 8, gap: 14 }}
        showsHorizontalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      <View
        pointerEvents="none"
        className="absolute bottom-0 right-0 top-0 w-14 bg-[linear-gradient(90deg,transparent_0%,rgba(11,7,16,0.9)_100%)]"
      />
    </View>
  );
}
