import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { openBillingPortal, startCheckout } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { WebAppShell, WebInfoRow, WebPanel } from '@/components/web/WebAppShell';
import { SCENES_ROUTE } from '@/constants/routes';
import { useBilling } from '@/hooks/use-billing';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { formatDateTime } from '@/utils/format';
import { openExternalUrl } from '@/utils/linking';

const PRO_FEATURES = ['Unlimited conversations', 'Unlimited custom companions', 'Priority access to new scenes'];

export default function WebBillingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const { pushError } = useErrorBanner();
  const { data, error, isLoading, refetch } = useBilling();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const isSuccess = params.status === 'success';

  useEffect(() => {
    if (!isSuccess) return;
    void refetch();
    const timeout = setTimeout(() => router.replace(SCENES_ROUTE), 5000);
    return () => clearTimeout(timeout);
  }, [isSuccess, refetch, router]);

  async function handleCheckout() {
    setIsCheckingOut(true);
    try {
      const payload = await startCheckout();
      openExternalUrl(payload.checkout_url);
    } catch {
      pushError('Checkout could not be started.');
      setIsCheckingOut(false);
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

  if (isLoading && !data) {
    return <LoadingScreen label="Loading billing..." />;
  }

  const isPro = data?.subscription.tier === 'pro';

  return (
    <WebAppShell title="Billing" subtitle="Manage plan status and verify Stripe checkout from the desktop workspace.">
      {error && !data ? (
        <EmptyState actionLabel="Try again" description="Billing status could not be loaded." onAction={refetch} title="Billing unavailable" />
      ) : (
        <View className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <WebPanel className="xl:col-span-2">
            {isSuccess ? (
              <View className="mb-5 rounded-lg border border-app-line bg-app-primarySoft p-4">
                <Text className="font-semibold text-app-primary">Checkout complete. Your account is refreshing.</Text>
              </View>
            ) : null}
            <Text className="text-sm font-semibold uppercase tracking-normal text-app-primary">Pro Monthly</Text>
            <Text className="mt-2 text-4xl font-semibold text-app-text">Upgrade your sandbox</Text>
            <Text className="mt-3 max-w-2xl text-base leading-7 text-app-muted">
              Keep conversations flowing and create more companions as your story grows.
            </Text>
            <View className="mt-7 gap-3">
              {PRO_FEATURES.map((feature) => (
                <View key={feature} className="flex-row items-center gap-3">
                  <Ionicons color="#1E6B52" name="checkmark-circle" size={19} />
                  <Text className="text-sm text-app-text">{feature}</Text>
                </View>
              ))}
            </View>
            <View className="mt-8 max-w-sm">
              {isPro ? (
                <Button isLoading={isOpeningPortal} label="Manage subscription" onPress={handlePortal} />
              ) : (
                <Button isLoading={isCheckingOut} label="Upgrade to Pro" onPress={handleCheckout} />
              )}
            </View>
          </WebPanel>

          {data ? (
            <WebPanel>
              <Text className="mb-3 text-xl font-semibold text-app-text">Current plan</Text>
              <WebInfoRow label="Tier" value={isPro ? 'Pro' : 'Free'} />
              <WebInfoRow label="Status" value={data.subscription.status} />
              <WebInfoRow label="Messages today" value={formatUsage(data.usage.messages_used_today, data.usage.message_limit_daily)} />
              <WebInfoRow label="Next billing date" value={formatDateTime(data.subscription.current_period_end)} />
            </WebPanel>
          ) : null}
        </View>
      )}
    </WebAppShell>
  );
}

function formatUsage(used: number, limit: number | null): string {
  return limit === null ? `${used} used` : `${used}/${limit}`;
}
