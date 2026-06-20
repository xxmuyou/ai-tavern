import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AuthGuard } from '@/components/AuthGuard';
import { BILLING_ROUTE, COMPANIONS_ROUTE, DISCOVER_ROUTE, MEMORIES_ROUTE, PERSONAS_ROUTE } from '@/constants/routes';
import { useSession } from '@/hooks/use-session';

import { CharaPalLogo } from './CharaPalLogo';
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
  { href: COMPANIONS_ROUTE, icon: 'people-outline', label: 'Companions', activePaths: [String(COMPANIONS_ROUTE), '/companion', '/scene', '/scenes'] },
  { href: '/companion-create' as Href, icon: 'sparkles-outline', label: 'Create' },
  { href: PERSONAS_ROUTE, icon: 'person-outline', label: 'Personas', activePaths: [String(PERSONAS_ROUTE)] },
  { href: MEMORIES_ROUTE, icon: 'images-outline', label: 'Memories' },
];

export function WebAppShell({
  breadcrumbs,
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
            className="min-w-[150px]"
          >
            <CharaPalLogo markSize={32} />
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
                  className={`min-h-10 flex-row items-center gap-2 rounded-full border px-3 transition-colors ${
                    active
                      ? 'border-app-rose/70 bg-[#10070d]/70'
                      : 'border-transparent bg-transparent hover:bg-white/8'
                  }`}
                >
                  <Ionicons color={active ? '#FF8FAD' : '#F6D6E0'} name={item.icon} size={16} />
                  <Text className={`text-caption font-semibold ${active ? 'text-app-rose-deep' : 'text-rose-50/80'}`}>
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
              {breadcrumbs && breadcrumbs.length > 0 ? (
                <Breadcrumbs breadcrumbs={breadcrumbs} />
              ) : null}
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

function Breadcrumbs({ breadcrumbs }: { breadcrumbs: NonNullable<WebAppShellProps['breadcrumbs']> }) {
  const router = useRouter();

  return (
    <View className="mb-5 flex-row flex-wrap items-center gap-2">
      {breadcrumbs.map((item, index) => {
        const isLast = index === breadcrumbs.length - 1;
        const href = item.href;
        return (
          <View key={`${item.label}-${index}`} className="flex-row items-center gap-2">
            {href && !isLast ? (
              <Pressable accessibilityRole="link" onPress={() => router.push(href)} className="rounded-full px-2 py-1 hover:bg-white/8">
                <Text className="text-caption font-semibold text-rose-50/70">{item.label}</Text>
              </Pressable>
            ) : (
              <Text className={`px-2 py-1 text-caption font-semibold ${isLast ? 'text-app-rose-deep' : 'text-rose-50/70'}`}>
                {item.label}
              </Text>
            )}
            {!isLast ? <Ionicons color="#8A7280" name="chevron-forward" size={13} /> : null}
          </View>
        );
      })}
    </View>
  );
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
