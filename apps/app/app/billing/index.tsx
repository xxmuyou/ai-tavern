import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { openBillingPortal, startCheckout } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { SCENES_ROUTE } from '@/constants/routes';
import { useBilling } from '@/hooks/use-billing';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { formatDateTime } from '@/utils/format';
import { openExternalUrl } from '@/utils/linking';

const PRO_FEATURES = ['Unlimited conversations', 'Unlimited custom companions', 'Priority access to new scenes'];

export default function BillingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const { pushError } = useErrorBanner();
  const { data, error, isLoading, refetch } = useBilling();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const isSuccess = params.status === 'success';

  useEffect(() => {
    if (!isSuccess) {
      return;
    }
    void refetch();
    const timeout = setTimeout(() => {
      router.replace(SCENES_ROUTE);
    }, 5000);
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

  if (error && !data) {
    return (
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title="Billing" />
        <EmptyState
          actionLabel="Try again"
          description="Billing status could not be loaded."
          onAction={refetch}
          title="Billing unavailable"
        />
      </View>
    );
  }

  const isPro = data?.subscription.tier === 'pro';

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showBack showQuota title="Billing" />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-3xl gap-5 px-4 py-6">
          {isSuccess ? (
            <View className="rounded-lg border border-app-line bg-app-card p-5">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-app-primarySoft">
                  <Ionicons color="#1E6B52" name="checkmark" size={22} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-lg font-semibold text-app-text">Checkout complete</Text>
                  <Text className="mt-1 text-sm text-app-muted">Your account is refreshing. Returning to Scenes shortly.</Text>
                </View>
              </View>
            </View>
          ) : null}

          <View className="rounded-lg border border-app-line bg-app-card p-5">
            <View className="flex-row items-start justify-between gap-4">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold uppercase tracking-normal text-app-primary">Pro Monthly</Text>
                <Text className="mt-2 text-3xl font-semibold text-app-text">Upgrade your sandbox</Text>
                <Text className="mt-2 text-base leading-6 text-app-muted">
                  Keep conversations flowing and create more companions as your story grows.
                </Text>
              </View>
              <View className="rounded-full bg-app-primarySoft px-3 py-1">
                <Text className="text-sm font-semibold text-app-primary">{isPro ? 'Active' : 'Free now'}</Text>
              </View>
            </View>

            <View className="mt-6 gap-3">
              {PRO_FEATURES.map((feature) => (
                <View key={feature} className="flex-row items-center gap-3">
                  <Ionicons color="#1E6B52" name="checkmark-circle" size={18} />
                  <Text className="text-sm text-app-text">{feature}</Text>
                </View>
              ))}
            </View>

            <View className="mt-6">
              {isPro ? (
                <Button isLoading={isOpeningPortal} label="Manage subscription" onPress={handlePortal} />
              ) : (
                <Button isLoading={isCheckingOut} label="Upgrade to Pro" onPress={handleCheckout} />
              )}
            </View>
          </View>

          {data ? (
            <View className="rounded-lg border border-app-line bg-app-card p-5">
              <Text className="text-lg font-semibold text-app-text">Current plan</Text>
              <View className="mt-4 gap-3">
                <BillingRow label="Tier" value={isPro ? 'Pro' : 'Free'} />
                <BillingRow label="Status" value={data.subscription.status} />
                <BillingRow label="Messages today" value={formatUsage(data.usage.messages_used_today, data.usage.message_limit_daily)} />
                <BillingRow label="Next billing date" value={formatDateTime(data.subscription.current_period_end)} />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function BillingRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="text-sm text-app-muted">{label}</Text>
      <Text className="text-sm font-semibold text-app-text">{value}</Text>
    </View>
  );
}

function formatUsage(used: number, limit: number | null): string {
  if (limit === null) {
    return `${used} used`;
  }
  return `${used}/${limit}`;
}
