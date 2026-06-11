import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AuthGuard } from '@/components/AuthGuard';
import { BILLING_ROUTE, COMPANIONS_ROUTE, DISCOVER_ROUTE, MEMORIES_ROUTE, SCENES_ROUTE } from '@/constants/routes';
import { useSession } from '@/hooks/use-session';

import { WebAuthControls } from './WebAuthControls';
import {
  WebButton,
  WebCard,
  WebPanel,
  WebQuotaBadge,
  WebTag,
  WebTopBar,
  type WebNavItem,
} from './ui';

type WebAppShellProps = {
  actions?: ReactNode;
  breadcrumbs?: { href?: Href; label: string }[];
  children: ReactNode;
  contentMode?: 'standard' | 'immersive';
  hero?: ReactNode;
  hideChrome?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  requireAuth?: boolean;
  subtitle?: string;
  title: string;
};

type ShellNavItem = WebNavItem & { activePaths?: string[] };

const BASE_NAV_ITEMS: ShellNavItem[] = [
  { href: DISCOVER_ROUTE, icon: 'compass-outline', label: 'Discover', activePaths: [String(DISCOVER_ROUTE)] },
  { href: COMPANIONS_ROUTE, icon: 'people-outline', label: 'Companions', activePaths: [String(COMPANIONS_ROUTE), '/companion'] },
  { href: SCENES_ROUTE, icon: 'map-outline', label: 'Scenes' },
  { href: '/companion-create' as Href, icon: 'sparkles-outline', label: 'Create' },
  { href: MEMORIES_ROUTE, icon: 'images-outline', label: 'Memories' },
];

export function WebAppShell({
  children,
  contentMode = 'standard',
  hero,
  hideChrome = false,
  maxWidth = '2xl',
  requireAuth = true,
}: WebAppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useSession();

  const content = (
    <>
      {hideChrome ? (
        <View className="min-h-screen flex-1 bg-[#10070d]">
          <View className="mx-auto w-full max-w-[1280px] px-8 py-10">{children}</View>
        </View>
      ) : (
      <View className="h-screen min-h-0 flex-1 overflow-hidden bg-[#10070d]">
        <View className="h-14 shrink-0 flex-row items-center justify-between border-b border-white/10 bg-[#10070d]/94 px-5 backdrop-blur">
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(DISCOVER_ROUTE)}
            className="min-w-[150px] flex-row items-center gap-2.5"
          >
            <View className="h-8 w-8 items-center justify-center rounded-xl border border-rose-200/20 bg-white/8">
              <Ionicons color="#FBE6EC" name="sparkles" size={15} />
            </View>
            <View>
              <Text className="font-serif text-title-sm text-white">AI Apps Box</Text>
            </View>
          </Pressable>

          <View className="min-w-0 flex-1 flex-row items-center justify-center gap-1 px-4">
            {BASE_NAV_ITEMS.map((item) => {
              const active = isShellNavActive(pathname, item);
              return (
                <Pressable
                  key={item.id ?? String(item.href)}
                  accessibilityRole="link"
                  accessibilityState={{ selected: active }}
                  onPress={() => router.push(item.href)}
                  className={`min-h-10 flex-row items-center gap-2 rounded-full px-3 ${
                    active ? 'bg-rose-200/18' : 'bg-transparent hover:bg-white/8'
                  }`}
                >
                  <Ionicons color={active ? '#fecdd3' : '#d6b7bd'} name={item.icon} size={16} />
                  <Text className={`text-caption font-semibold ${active ? 'text-rose-100' : 'text-white/68'}`}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="min-w-[150px] flex-row items-center justify-end gap-2.5">
            {session ? <WebQuotaBadge onPress={() => router.push(BILLING_ROUTE)} /> : null}
            <WebAuthControls />
          </View>
        </View>

        {contentMode === 'immersive' ? (
          <View className="min-h-0 w-full flex-1 overflow-hidden">{children}</View>
        ) : (
          <ScrollView
            className="editorial-scroll min-h-0 flex-1"
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {hero ? <View>{hero}</View> : null}
            <View className={`mx-auto w-full px-8 py-8 ${maxWidth === 'full' ? '' : maxWidthToClass(maxWidth)}`}>
              {children}
            </View>
          </ScrollView>
        )}
      </View>
      )}
    </>
  );

  return requireAuth ? <AuthGuard>{content}</AuthGuard> : content;
}

function isShellNavActive(pathname: string, item: ShellNavItem): boolean {
  const activePaths = item.activePaths ?? [String(item.href)];
  return activePaths.some((path) => {
    if (path === DISCOVER_ROUTE) return pathname === DISCOVER_ROUTE;
    return pathname === path || pathname.startsWith(`${path}/`);
  });
}

function maxWidthToClass(width: NonNullable<WebAppShellProps['maxWidth']>): string {
  switch (width) {
    case 'sm': return 'max-w-3xl';
    case 'md': return 'max-w-5xl';
    case 'lg': return 'max-w-6xl';
    case 'xl': return 'max-w-7xl';
    case '2xl': return 'max-w-[1280px]';
    case '3xl': return 'max-w-[1440px]';
    case 'full': return 'max-w-none';
  }
}

export { WebCard, WebPanel, WebTag, WebButton, WebTopBar };

// Re-export the old `WebInfoRow` name as `WebFieldRow` to keep call sites
// easy to migrate without renaming the import everywhere.
export { WebFieldRow as WebInfoRow } from './ui';
