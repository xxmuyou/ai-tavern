import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

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
import { WebAppShell, WebInfoRow, WebPanel } from '@/components/web/WebAppShell';
import { SCENES_ROUTE } from '@/constants/routes';
import { useBilling } from '@/hooks/use-billing';
import { useCredits } from '@/hooks/use-credits';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { formatDateTime } from '@/utils/format';
import { openExternalUrl } from '@/utils/linking';

const PRO_FEATURES = ['Unlimited conversations', 'Unlimited custom companions', 'Priority access to new scenes'];

const CREDIT_PACKAGES: { id: CreditPackageId; label: string; credits: number; price: string }[] = [
  { id: 'small', label: 'Small', credits: 500, price: '$4.99' },
  { id: 'medium', label: 'Medium', credits: 1200, price: '$9.99' },
  { id: 'large', label: 'Large', credits: 3000, price: '$19.99' },
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

export default function WebBillingScreen() {
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
      // Ledger is best-effort; the balance panel still renders without it.
    }
  }, []);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  useEffect(() => {
    if (!isSuccess) return;
    void refetch();
    void credits.refetch();
    void loadLedger();
    const timeout = setTimeout(() => router.replace(SCENES_ROUTE), 5000);
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

  const isPro = data?.subscription.tier === 'pro';

  return (
    <WebAppShell title="Billing" subtitle="Manage plan status and verify Stripe checkout from the desktop workspace.">
      <View className="gap-8">
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

        <View className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <WebPanel className="xl:col-span-2">
            <Text className="mb-3 text-xl font-semibold text-app-text">Credits</Text>
            {credits.data ? (
              <>
                <WebInfoRow label="Available" value={String(credits.data.available_credits)} />
                <WebInfoRow label="Reserved" value={String(credits.data.reserved_credits)} />
                {credits.data.monthly_grant ? (
                  <WebInfoRow
                    label="This month's grant"
                    value={`${credits.data.monthly_grant.amount} credits (${credits.data.monthly_grant.tier === 'pro' ? 'Pro' : 'Free'})`}
                  />
                ) : null}
              </>
            ) : credits.isLoading ? (
              <Text className="text-sm text-app-muted">Loading credits...</Text>
            ) : (
              <Text className="text-sm text-app-muted">Credits are unavailable right now.</Text>
            )}

            <Text className="mb-3 mt-8 text-sm font-semibold uppercase tracking-normal text-app-primary">Buy credits</Text>
            <View className="flex-row flex-wrap gap-4">
              {CREDIT_PACKAGES.map((pkg) => (
                <View key={pkg.id} className="min-w-[160px] flex-1 rounded-lg border border-app-line p-4">
                  <Text className="text-base font-semibold text-app-text">{pkg.label}</Text>
                  <Text className="mt-1 text-sm text-app-muted">{pkg.credits} credits</Text>
                  <Text className="mb-3 mt-1 text-lg font-semibold text-app-text">{pkg.price}</Text>
                  <Button
                    isLoading={checkoutPackage === pkg.id}
                    label="Buy"
                    onPress={() => handleCreditsCheckout(pkg.id)}
                    variant="secondary"
                  />
                </View>
              ))}
            </View>
          </WebPanel>

          <WebPanel>
            <Text className="mb-3 text-xl font-semibold text-app-text">Recent activity</Text>
            {ledger.length ? (
              ledger.map((entry) => (
                <WebInfoRow
                  key={entry.id}
                  label={`${LEDGER_LABELS[entry.type]} · ${formatDateTime(entry.created_at)}`}
                  value={`${entry.amount > 0 ? '+' : ''}${entry.amount}`}
                />
              ))
            ) : (
              <Text className="text-sm text-app-muted">No credit activity yet.</Text>
            )}
          </WebPanel>
        </View>
      </View>
    </WebAppShell>
  );
}

function formatUsage(used: number, limit: number | null): string {
  return limit === null ? `${used} used` : `${used}/${limit}`;
}
