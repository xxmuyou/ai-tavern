import { Ionicons } from '@expo/vector-icons';
import { usePathname, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { AuthGuard } from '@/components/AuthGuard';
import { ADMIN_ROUTE, BILLING_ROUTE, COMPANIONS_ROUTE, ME_ROUTE, SCENES_ROUTE } from '@/constants/routes';
import { useMe } from '@/hooks/use-me';

import { WebAuthControls } from './WebAuthControls';
import {
  WebButton,
  WebCard,
  WebPanel,
  WebQuotaBadge,
  WebSidebar,
  WebTag,
  WebTopBar,
  type WebNavItem,
} from './ui';

type WebAppShellProps = {
  actions?: ReactNode;
  breadcrumbs?: { href?: Href; label: string }[];
  children: ReactNode;
  hero?: ReactNode;
  hideChrome?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  subtitle?: string;
  title: string;
};

const BASE_NAV_ITEMS: WebNavItem[] = [
  { href: COMPANIONS_ROUTE, icon: 'people-outline', label: 'Companions' },
  { href: SCENES_ROUTE, icon: 'map-outline', label: 'Scenes' },
  { href: ME_ROUTE, icon: 'person-circle-outline', label: 'Me' },
  { href: BILLING_ROUTE, icon: 'card-outline', label: 'Billing' },
];

const ADMIN_NAV_ITEM: WebNavItem = { href: ADMIN_ROUTE, icon: 'shield-checkmark-outline', label: 'Admin' };

export function WebAppShell({
  actions,
  breadcrumbs,
  children,
  hero,
  hideChrome = false,
  maxWidth = '2xl',
  subtitle,
  title,
}: WebAppShellProps) {
  const pathname = usePathname();
  const { me } = useMe();
  const navItems: WebNavItem[] = me?.is_admin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS;

  if (hideChrome) {
    return (
      <AuthGuard>
        <View className="min-h-screen flex-1 bg-app-canvas">
          <View className="mx-auto w-full max-w-[1280px] px-8 py-10">{children}</View>
        </View>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <View className="h-screen min-h-0 flex-1 overflow-hidden bg-app-canvas">
        <View className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-row">
          <WebSidebar items={navItems} />

          <View className="min-h-0 min-w-0 flex-1">
            <WebTopBar actions={
              <View className="flex-row items-center gap-3">
                <WebQuotaBadge />
                {actions}
                <WebAuthControls />
              </View>
            } breadcrumbs={breadcrumbs ?? defaultBreadcrumbs(pathname)} subtitle={subtitle} title={title} />
            <ScrollView
              className="editorial-scroll min-h-0 flex-1"
              contentContainerStyle={{ flexGrow: 1 }}
            >
              {hero ? <View>{hero}</View> : null}
              <View className={`mx-auto w-full px-8 ${maxWidth === 'full' ? '' : maxWidthToClass(maxWidth)} ${hero ? 'py-10' : 'py-10'}`}>
                {children}
              </View>
            </ScrollView>
          </View>
        </View>
      </View>
    </AuthGuard>
  );
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

type Crumb = { href?: Href; label: string };

const ROUTE_CRUMBS: { match: Href; crumb: Crumb }[] = [
  { match: SCENES_ROUTE, crumb: { label: 'Scenes' } },
  { match: COMPANIONS_ROUTE, crumb: { label: 'Companions' } },
  { match: ME_ROUTE, crumb: { label: 'Me' } },
  { match: BILLING_ROUTE, crumb: { label: 'Billing' } },
  { match: ADMIN_ROUTE, crumb: { label: 'Admin' } },
];

function defaultBreadcrumbs(pathname: string): Crumb[] {
  for (const { match, crumb } of ROUTE_CRUMBS) {
    if (pathname === match || pathname.startsWith(`${match}/`)) {
      return [{ href: match, label: 'Home' }, crumb];
    }
  }
  return [];
}

export { WebCard, WebPanel, WebTag, WebButton, WebTopBar };

// Re-export the old `WebInfoRow` name as `WebFieldRow` to keep call sites
// easy to migrate without renaming the import everywhere.
export { WebFieldRow as WebInfoRow } from './ui';
