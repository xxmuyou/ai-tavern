import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  getCreditLedger,
  openBillingPortal,
  startCheckout,
  startCreditsCheckout,
} from '@/api/companion-client';
import type { CreditLedgerEntry, CreditLedgerType, CreditPackageId } from '@/api/types';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { CREDIT_PACKAGES, MONTHLY_CREDIT_GRANT } from '@/constants/billing';
import { SCENES_ROUTE } from '@/constants/routes';
import { useBilling } from '@/hooks/use-billing';
import { useCredits } from '@/hooks/use-credits';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { formatDateTime } from '@/utils/format';
import { openExternalUrl } from '@/utils/linking';

const PRO_FEATURES = [
  `${MONTHLY_CREDIT_GRANT.pro.toLocaleString()} credits every month`,
  'Unlimited custom companions',
  'Buy extra credits any time without changing your plan',
];

const LEDGER_LABELS: Record<CreditLedgerType, string> = {
  adjustment: 'Adjustment',
  commit: 'Spent',
  expire: 'Expired',
  grant_monthly: 'Monthly grant',
  purchase: 'Purchase',
  refund: 'Refund',
  release: 'Released',
  reserve: 'Reserved',
};

export default function BillingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const { pushError } = useErrorBanner();
  const { data, error, isLoading, refetch } = useBilling();
  const credits = useCredits();
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const [checkoutPackage, setCheckoutPackage] = useState<CreditPackageId | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const isSuccess = params.status === 'success';

  const loadLedger = useCallback(async () => {
    try {
      const payload = await getCreditLedger({ limit: 20 });
      setLedger(payload.entries);
    } catch {
      // Ledger is best-effort; the balance card still renders without it.
    }
  }, []);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  useEffect(() => {
    if (!isSuccess) {
      return;
    }
    void refetch();
    void credits.refetch();
    void loadLedger();
    const timeout = setTimeout(() => {
      router.replace(SCENES_ROUTE);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [isSuccess, refetch, credits, loadLedger, router]);

  async function handleCreditsCheckout(pkg: CreditPackageId) {
    setCheckoutPackage(pkg);
    try {
      const payload = await startCreditsCheckout(pkg);
      openExternalUrl(payload.checkout_url);
    } catch {
      pushError('Credit purchase could not be started.');
    } finally {
      setCheckoutPackage(null);
    }
  }

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
            <Text className="text-lg font-semibold text-app-text">Credits</Text>
            <Text className="mt-1 text-sm text-app-muted">
              Credits power every chat and image. Spend them as you go—top up or upgrade to Pro for more each month.
            </Text>
            <View className="mt-4 gap-3">
              {credits.data ? (
                <>
                  <BillingRow label="Available" value={credits.data.available_credits.toLocaleString()} />
                  <BillingRow label="Reserved" value={credits.data.reserved_credits.toLocaleString()} />
                  {credits.data.monthly_grant ? (
                    <BillingRow
                      label="This month's grant"
                      value={`${credits.data.monthly_grant.amount.toLocaleString()} (${credits.data.monthly_grant.tier === 'pro' ? 'Pro' : 'Free'})`}
                    />
                  ) : null}
                </>
              ) : (
                <Text className="text-sm text-app-muted">
                  {credits.isLoading ? 'Loading credits...' : 'Credits are unavailable right now.'}
                </Text>
              )}
            </View>

            <Text className="mb-3 mt-6 text-sm font-semibold uppercase tracking-normal text-app-primary">Buy credits</Text>
            <View className="gap-3">
              {CREDIT_PACKAGES.map((pkg) => (
                <View key={pkg.id} className="flex-row items-center justify-between gap-3 rounded-lg border border-app-line p-3">
                  <View className="min-w-0 flex-1">
                    <Text className="text-base font-semibold text-app-text">{pkg.label}</Text>
                    <Text className="text-sm text-app-muted">{pkg.credits.toLocaleString()} credits · {pkg.price}</Text>
                  </View>
                  <View className="w-24">
                    <Button
                      isLoading={checkoutPackage === pkg.id}
                      label="Buy"
                      onPress={() => handleCreditsCheckout(pkg.id)}
                      variant="secondary"
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-lg border border-app-line bg-app-card p-5">
            <View className="flex-row items-start justify-between gap-4">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold uppercase tracking-normal text-app-primary">Pro Monthly</Text>
                <Text className="mt-2 text-3xl font-semibold text-app-text">Upgrade your sandbox</Text>
                <Text className="mt-2 text-base leading-6 text-app-muted">
                  More monthly credits, unlimited custom companions, and the same pay as you go top-ups whenever you need them.
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
                <BillingRow label="Next billing date" value={formatDateTime(data.subscription.current_period_end)} />
              </View>
            </View>
          ) : null}

          {ledger.length ? (
            <View className="rounded-lg border border-app-line bg-app-card p-5">
              <Text className="text-lg font-semibold text-app-text">Recent activity</Text>
              <View className="mt-4 gap-3">
                {ledger.map((entry) => (
                  <BillingRow
                    key={entry.id}
                    label={`${LEDGER_LABELS[entry.type]} · ${formatDateTime(entry.created_at)}`}
                    value={`${entry.amount > 0 ? '+' : ''}${entry.amount}`}
                  />
                ))}
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
