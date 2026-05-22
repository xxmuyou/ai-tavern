import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { fetchMe, openBillingPortal } from '@/api/companion-client';
import type { MeResponse } from '@/api/types';
import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { BILLING_ROUTE } from '@/constants/routes';
import { useBilling } from '@/hooks/use-billing';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSession } from '@/hooks/use-session';
import { formatDateTime, formatProvider } from '@/utils/format';
import { openExternalUrl } from '@/utils/linking';

export default function MeScreen() {
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const { session, signOut } = useSession();
  const { data: billing, refetch: refetchBilling } = useBilling();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadMe() {
      try {
        const payload = await fetchMe();
        if (isMounted) {
          setMe(payload);
        }
      } catch {
        pushError('Could not load account details.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadMe();
    void refetchBilling();
    return () => {
      isMounted = false;
    };
  }, [pushError, refetchBilling]);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  }

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

  if (isLoading) {
    return <LoadingScreen label="Loading account..." />;
  }

  const email = me?.email ?? session?.email ?? '';
  const isPro = billing?.subscription.tier === 'pro' || me?.subscription.tier === 'pro';
  const displayName = me?.display_name ?? email;
  const version = Constants.expoConfig?.version ?? '0.1.0';
  const messagesUsed = billing?.usage.messages_used_today ?? me?.quota.messages_used_today ?? 0;
  const messageLimit = billing?.usage.message_limit_daily ?? me?.quota.message_limit_daily ?? me?.quota.messages_limit_today ?? null;

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showQuota title="Me" />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-3xl gap-4 px-4 py-6">
          <View className="rounded-lg border border-app-line bg-app-card p-5">
            <View className="flex-row items-center gap-4">
              <View className="h-16 w-16 items-center justify-center rounded-lg bg-app-primarySoft">
                <Text className="text-2xl font-semibold text-app-primary">{displayName.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-2xl font-semibold text-app-text">
                  {displayName}
                </Text>
                <Text numberOfLines={1} className="mt-1 text-sm text-app-muted">
                  {email}
                </Text>
              </View>
            </View>
          </View>

          <Section title="Account">
            <InfoRow label="Email" value={email} />
            <InfoRow label="Email verified" value={me?.email_verified ? 'Yes' : 'No'} />
            <View className="mt-2 flex-row flex-wrap gap-2">
              {(me?.linked_providers?.length ? me.linked_providers : ['email']).map((provider) => (
                <View key={provider} className="rounded-full bg-app-primarySoft px-3 py-1">
                  <Text className="text-sm font-semibold text-app-primary">{formatProvider(provider)}</Text>
                </View>
              ))}
            </View>
          </Section>

          <Section title="Subscription">
            <InfoRow label="Plan" value={isPro ? 'Pro' : 'Free'} />
            {isPro ? (
              <>
                <InfoRow label="Next billing date" value={formatDateTime(billing?.subscription.current_period_end ?? me?.subscription.current_period_end)} />
                <Button isLoading={isOpeningPortal} label="Manage subscription" onPress={handlePortal} />
              </>
            ) : (
              <>
                <Text className="text-sm leading-5 text-app-muted">Free includes 30 messages per day and 3 custom companions.</Text>
                <Button label="Upgrade to Pro" onPress={() => router.push(BILLING_ROUTE)} />
              </>
            )}
          </Section>

          <Section title="Usage">
            <InfoRow label="Messages today" value={formatUsage(messagesUsed, messageLimit)} />
            {isPro && billing?.usage.subscriber_soft_threshold_exceeded ? (
              <Text className="text-sm text-app-warning">High usage detected today.</Text>
            ) : null}
          </Section>

          <Section title="Other">
            <InfoRow label="Version" value={version} />
            <Button isLoading={isSigningOut} label="Sign out" onPress={handleSignOut} variant="secondary" />
          </Section>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View className="gap-4 rounded-lg border border-app-line bg-app-card p-5">
      <Text className="text-lg font-semibold text-app-text">{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="text-sm text-app-muted">{label}</Text>
      <Text numberOfLines={2} className="max-w-[60%] text-right text-sm font-semibold text-app-text">
        {value}
      </Text>
    </View>
  );
}

function formatUsage(used: number, limit: number | null): string {
  if (limit === null) {
    return `${used} used`;
  }
  return `${used}/${limit}`;
}
