import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { BRAND_NAME, BRAND_TAGLINE } from '@/constants/brand';
import { PALETTE } from '@/constants/palette';

import { cn } from './cn';

export type WebNavItem = {
  badge?: string | number;
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  id?: string;
  label: string;
};

export type WebSidebarProps = {
  activeId?: string;
  bottomSlot?: ReactNode;
  brandSubtitle?: string;
  brandTitle?: string;
  className?: string;
  items: WebNavItem[];
  onItemPress?: (item: WebNavItem) => void;
  width?: number;
};

export function WebSidebar({
  activeId,
  bottomSlot,
  brandSubtitle = BRAND_TAGLINE,
  brandTitle = BRAND_NAME,
  className,
  items,
  onItemPress,
  width = 240,
}: WebSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View
      className={cn('h-full border-r border-app-line bg-app-surface/60 px-4 py-6', className)}
      style={{ width }}
    >
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(items[0]?.href ?? ('/' as Href))}
        className="mb-7 px-2"
      >
        <Text className="font-serif text-[22px] font-semibold text-white">{brandTitle}</Text>
        <Text className="mt-0.5 text-caption text-rose-50/60">{brandSubtitle}</Text>
      </Pressable>

      <ScrollView className="editorial-scroll flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-0.5">
          {items.map((item) => {
            const active = activeId
              ? activeId === (item.id ?? String(item.href))
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Pressable
                key={item.id ?? String(item.href)}
                accessibilityRole="link"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (onItemPress) onItemPress(item);
                  else router.push(item.href);
                }}
                className={cn(
                  'relative flex-row items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                  active ? 'border-app-rose/70 bg-app-canvas/70' : 'border-transparent bg-transparent hover:bg-white/[0.05]',
                )}
              >
                {active ? (
                  <View className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-app-rose" />
                ) : null}
                <Ionicons color={active ? PALETTE.roseDeep : PALETTE.muted} name={item.icon} size={18} />
                <Text
                  className={cn(
                    'flex-1 text-body-sm font-semibold',
                    active ? 'text-app-rose-deep' : 'text-app-ink-soft',
                  )}
                >
                  {item.label}
                </Text>
                {item.badge ? (
                  <View className="min-w-5 items-center justify-center rounded-full bg-app-rose px-2 py-0.5">
                    <Text className="text-[11px] font-semibold text-white">{item.badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {bottomSlot ? <View className="mt-4">{bottomSlot}</View> : null}
    </View>
  );
}
