import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PALETTE } from '@/constants/palette';

import { cn } from './cn';

type Crumb = { href?: Href; label: string };

export type WebTopBarProps = {
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  className?: string;
  subtitle?: string;
  title: string;
};

export function WebTopBar({ actions, breadcrumbs, className, subtitle, title }: WebTopBarProps) {
  const router = useRouter();
  return (
    <View className={cn('border-b border-app-line bg-app-canvas/85 px-10 py-7 backdrop-blur', className)}>
      {breadcrumbs?.length ? (
        <View className="mb-2 flex-row items-center gap-1.5">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <View key={`${crumb.label}-${idx}`} className="flex-row items-center gap-1.5">
                {crumb.href && !isLast ? (
                  <Pressable accessibilityRole="link" onPress={() => router.push(crumb.href as Href)}>
                    <Text className="text-caption font-semibold text-app-muted hover:text-app-rose">{crumb.label}</Text>
                  </Pressable>
                ) : (
                  <Text className={cn('text-caption font-semibold', isLast ? 'text-white' : 'text-rose-50/60')}>
                    {crumb.label}
                  </Text>
                )}
                {!isLast ? <Ionicons color={PALETTE.mutedSoft} name="chevron-forward" size={12} /> : null}
              </View>
            );
          })}
        </View>
      ) : null}
      <View className="flex-row items-center justify-between gap-4">
        <View className="min-w-0 flex-1">
          <Text className="font-serif text-title text-white">{title}</Text>
          {subtitle ? (
            <Text className="mt-1 max-w-2xl text-caption text-rose-50/60">{subtitle}</Text>
          ) : null}
        </View>
        {actions ? <View className="flex-row items-center gap-3">{actions}</View> : null}
      </View>
    </View>
  );
}
