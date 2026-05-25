import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fetchMe, openBillingPortal, updateRomancePreference } from '@/api/companion-client';
import type { MeResponse, RomancePreference } from '@/api/types';
import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
import { WebAppShell, WebInfoRow, WebPanel } from '@/components/web/WebAppShell';
import { ADMIN_ROUTE, BILLING_ROUTE } from '@/constants/routes';
import { useBilling } from '@/hooks/use-billing';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSession } from '@/hooks/use-session';
import { formatDateTime, formatProvider } from '@/utils/format';
import { openExternalUrl } from '@/utils/linking';

export default function WebMeScreen() {
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const { session, signOut } = useSession();
  const { data: billing, refetch: refetchBilling } = useBilling();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchMe()
      .then((payload) => {
        if (mounted) setMe(payload);
      })
      .catch(() => pushError('Could not load account details.'))
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    void refetchBilling();
    return () => {
      mounted = false;
    };
  }, [pushError, refetchBilling]);

  if (isLoading) {
    return <LoadingScreen label="Loading account..." />;
  }

  const email = me?.email ?? session?.email ?? '';
  const displayName = me?.display_name ?? email;
  const isPro = billing?.subscription.tier === 'pro' || me?.subscription.tier === 'pro';
  const messagesUsed = billing?.usage.messages_used_today ?? me?.quota.messages_used_today ?? 0;
  const messageLimit = billing?.usage.message_limit_daily ?? me?.quota.message_limit_daily ?? me?.quota.messages_limit_today ?? null;

  async function handlePortal() {
    setIsOpeningPortal(true);
    try {
      const payload = await openBillingPortal();
      openExternalUrl(payload.portal_url);
    } catch {
      pushError('Subscription management is not available yet.');
      setIsOpeningPortal(false);
    }
  }

  return (
    <WebAppShell title="Me" subtitle="Account, subscription, usage, and workspace controls.">
      <View className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <WebPanel className="xl:col-span-1">
          <View className="h-20 w-20 items-center justify-center rounded-lg bg-app-primarySoft">
            <Text className="text-3xl font-semibold text-app-primary">{displayName.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text className="mt-5 text-2xl font-semibold text-app-text">{displayName}</Text>
          <Text className="mt-1 text-sm text-app-muted">{email}</Text>
          <View className="mt-5 flex-row flex-wrap gap-2">
            {(me?.linked_providers?.length ? me.linked_providers : ['email']).map((provider) => (
              <View key={provider} className="rounded-full bg-app-primarySoft px-3 py-1">
                <Text className="text-sm font-semibold text-app-primary">{formatProvider(provider)}</Text>
              </View>
            ))}
          </View>
          <View className="mt-6 gap-3">
            {me?.is_admin ? <Button label="Admin workspace" onPress={() => router.push(ADMIN_ROUTE)} variant="secondary" /> : null}
            <Button label="Sign out" onPress={() => void signOut()} variant="secondary" />
          </View>
        </WebPanel>

        <View className="gap-6 xl:col-span-2">
          <WebPanel>
            <Text className="mb-3 text-xl font-semibold text-app-text">Account</Text>
            <WebInfoRow label="Email verified" value={me?.email_verified ? 'Yes' : 'No'} />
            <WebInfoRow label="Version" value={Constants.expoConfig?.version ?? '0.1.0'} />
          </WebPanel>

          <WebPanel>
            <Text className="mb-3 text-xl font-semibold text-app-text">Romance preference</Text>
            <PreferencePicker
              value={me?.romance_preference ?? 'any'}
              onChange={(next) => {
                if (!me) return;
                const previous = me.romance_preference;
                setMe({ ...me, romance_preference: next });
                void updateRomancePreference(next).catch(() => {
                  setMe({ ...me, romance_preference: previous });
                  pushError('Could not update preference.');
                });
              }}
            />
          </WebPanel>

          <WebPanel>
            <Text className="mb-3 text-xl font-semibold text-app-text">Subscription and usage</Text>
            <WebInfoRow label="Plan" value={isPro ? 'Pro' : 'Free'} />
            <WebInfoRow label="Messages today" value={formatUsage(messagesUsed, messageLimit)} />
            <WebInfoRow label="Next billing date" value={formatDateTime(billing?.subscription.current_period_end ?? me?.subscription.current_period_end)} />
            <View className="mt-5">
              {isPro ? (
                <Button isLoading={isOpeningPortal} label="Manage subscription" onPress={handlePortal} />
              ) : (
                <Button label="Upgrade to Pro" onPress={() => router.push(BILLING_ROUTE)} />
              )}
            </View>
          </WebPanel>
        </View>
      </View>
    </WebAppShell>
  );
}

const PREFERENCE_OPTIONS: { label: string; value: RomancePreference }[] = [
  { label: 'Women', value: 'female' },
  { label: 'Men', value: 'male' },
  { label: 'Anyone', value: 'any' },
];

function PreferencePicker({ value, onChange }: { value: RomancePreference; onChange: (next: RomancePreference) => void }) {
  return (
    <View className="flex-row gap-2">
      {PREFERENCE_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) onChange(opt.value);
            }}
            className={`rounded-md border px-4 py-2 ${active ? 'border-app-primary bg-app-primary' : 'border-app-line bg-white'}`}
          >
            <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-app-text'}`}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatUsage(used: number, limit: number | null): string {
  return limit === null ? `${used} used` : `${used}/${limit}`;
}
