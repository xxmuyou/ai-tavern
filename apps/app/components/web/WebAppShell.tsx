import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AuthGuard } from '@/components/AuthGuard';
import { QuotaBadge } from '@/components/QuotaBadge';
import { ADMIN_ROUTE, BILLING_ROUTE, COMPANIONS_ROUTE, ME_ROUTE, SCENES_ROUTE } from '@/constants/routes';
import { useSession } from '@/hooks/use-session';

type WebAppShellProps = {
  actions?: ReactNode;
  children: ReactNode;
  subtitle?: string;
  title: string;
};

const NAV_ITEMS: { href: Href; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { href: SCENES_ROUTE, icon: 'map-outline', label: 'Scenes' },
  { href: COMPANIONS_ROUTE, icon: 'people-outline', label: 'Companions' },
  { href: ME_ROUTE, icon: 'person-circle-outline', label: 'Me' },
  { href: BILLING_ROUTE, icon: 'card-outline', label: 'Billing' },
  { href: ADMIN_ROUTE, icon: 'shield-checkmark-outline', label: 'Admin' },
];

export function WebAppShell({ actions, children, subtitle, title }: WebAppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, signOut } = useSession();

  return (
    <AuthGuard>
      <View className="min-h-screen flex-1 bg-[#F3F5F7]">
        <View className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-row">
          <View className="w-72 border-r border-app-line bg-white px-5 py-6">
            <Pressable accessibilityRole="button" onPress={() => router.push(SCENES_ROUTE)} className="mb-8">
              <Text className="text-2xl font-semibold text-app-text">AI Apps Box</Text>
              <Text className="mt-1 text-sm text-app-muted">Relationship sandbox</Text>
            </Pressable>

            <View className="gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Pressable
                    key={String(item.href)}
                    accessibilityRole="link"
                    onPress={() => router.push(item.href)}
                    className={`min-h-11 flex-row items-center gap-3 rounded-md px-3 ${
                      active ? 'bg-app-primarySoft' : 'bg-transparent'
                    }`}
                  >
                    <Ionicons color={active ? '#1E6B52' : '#687076'} name={item.icon} size={19} />
                    <Text className={`text-sm font-semibold ${active ? 'text-app-primary' : 'text-app-muted'}`}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="mt-auto rounded-lg border border-app-line bg-app-bg p-4">
              <Text numberOfLines={1} className="text-sm font-semibold text-app-text">
                {session?.email ?? 'Signed in'}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => void signOut()} className="mt-3">
                <Text className="text-sm font-semibold text-app-primary">Sign out</Text>
              </Pressable>
            </View>
          </View>

          <View className="min-w-0 flex-1">
            <View className="border-b border-app-line bg-white px-8 py-5">
              <View className="flex-row items-start justify-between gap-6">
                <View className="min-w-0 flex-1">
                  <Text className="text-3xl font-semibold text-app-text">{title}</Text>
                  {subtitle ? <Text className="mt-1 text-base text-app-muted">{subtitle}</Text> : null}
                </View>
                <View className="flex-row items-center gap-3">
                  <QuotaBadge />
                  {actions}
                </View>
              </View>
            </View>
            <ScrollView className="flex-1" contentContainerStyle={{ padding: 32 }}>
              {children}
            </ScrollView>
          </View>
        </View>
      </View>
    </AuthGuard>
  );
}

export function WebPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-lg border border-app-line bg-white p-6 ${className}`}>{children}</View>;
}

export function WebInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-5 border-b border-app-line py-3 last:border-b-0">
      <Text className="text-sm text-app-muted">{label}</Text>
      <Text numberOfLines={2} className="max-w-[65%] text-right text-sm font-semibold text-app-text">
        {value}
      </Text>
    </View>
  );
}
