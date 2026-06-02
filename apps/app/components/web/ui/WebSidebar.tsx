import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
  brandSubtitle = 'Relationship sandbox',
  brandTitle = 'AI Apps Box',
  className,
  items,
  onItemPress,
  width = 240,
}: WebSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View
      className={cn('h-full border-r border-app-line bg-app-surface px-4 py-6', className)}
      style={{ width }}
    >
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(items[0]?.href ?? ('/' as Href))}
        className="mb-7 px-2"
      >
        <Text className="font-serif text-[22px] font-semibold text-app-ink">{brandTitle}</Text>
        <Text className="mt-0.5 text-caption text-app-muted">{brandSubtitle}</Text>
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
                  'flex-row items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                  active ? 'bg-rose-soft' : 'bg-transparent hover:bg-app-sunken/60',
                )}
              >
                <Ionicons color={active ? '#9A2F4F' : '#7A6A5E'} name={item.icon} size={18} />
                <Text
                  className={cn(
                    'flex-1 text-body-sm font-semibold',
                    active ? 'text-rose-deep' : 'text-app-ink-soft',
                  )}
                >
                  {item.label}
                </Text>
                {item.badge ? (
                  <View className="min-w-5 items-center justify-center rounded-full bg-rose px-2 py-0.5">
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
