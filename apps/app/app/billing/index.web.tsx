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
import { WebAppShell } from '@/components/web/WebAppShell';
import {
  WebButton,
  WebCard,
  WebEmptyState,
  WebFieldRow,
  WebLoading,
  WebPriceCard,
  WebSection,
  WebTag,
  WebTimeline,
  type WebTimelineEntry,
} from '@/components/web/ui';
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
    return <WebLoading label="Opening the ledger..." />;
  }

  const isPro = data?.subscription.tier === 'pro';
  const ledgerEntries: WebTimelineEntry[] = ledger.map((entry) => ({
    id: entry.id,
    meta: formatDateTime(entry.created_at),
    title: `${LEDGER_LABELS[entry.type]} · ${entry.amount > 0 ? '+' : ''}${entry.amount}`,
  }));

  return (
    <WebAppShell title="Billing" subtitle="Plan status, subscription controls, and credits for image generation.">
      <View className="gap-8">
        {isSuccess ? (
          <View className="flex-row items-center gap-3 rounded-2xl border border-app-success/20 bg-app-success/10 px-5 py-4">
            <Ionicons color="#1E8E5C" name="checkmark-circle" size={18} />
            <Text className="text-body-sm font-semibold text-app-success">Checkout complete. Your account is refreshing.</Text>
          </View>
        ) : null}

        {error && !data ? (
          <WebEmptyState
            actionLabel="Try again"
            description="Billing status could not be loaded."
            icon="card-outline"
            onAction={refetch}
            title="Billing unavailable"
          />
        ) : (
          <View className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <WebPriceCard
              className="xl:col-span-2"
              cta={
                isPro ? (
                  <WebButton
                    iconLeft={<Ionicons color="#9A2F4F" name="settings-outline" size={16} />}
                    isLoading={isOpeningPortal}
                    label="Manage subscription"
                    onPress={handlePortal}
                    variant="primary"
                  />
                ) : (
                  <WebButton
                    iconLeft={<Ionicons color="#9A2F4F" name="sparkles-outline" size={16} />}
                    isLoading={isCheckingOut}
                    label="Upgrade to Pro"
                    onPress={handleCheckout}
                    variant="primary"
                  />
                )
              }
              description="Keep conversations flowing and create more companions as your story grows."
              features={PRO_FEATURES}
              highlight={!isPro}
              price="$9.99"
              priceUnit="/ month"
              title="Pro Monthly"
            />

            {data ? (
              <WebCard padding="md">
                <View className="mb-3 flex-row items-center justify-between gap-3">
                  <Text className="font-serif text-title text-app-ink">Current plan</Text>
                  <WebTag size="sm" variant={isPro ? 'rose' : 'neutral'}>
                    {isPro ? 'Pro' : 'Free'}
                  </WebTag>
                </View>
                <WebFieldRow label="Tier" value={isPro ? 'Pro' : 'Free'} />
                <WebFieldRow label="Status" value={data.subscription.status} />
                <WebFieldRow
                  label="Messages today"
                  value={formatUsage(data.usage.messages_used_today, data.usage.message_limit_daily)}
                />
                <WebFieldRow label="Next billing date" value={formatDateTime(data.subscription.current_period_end)} />
              </WebCard>
            ) : null}
          </View>
        )}

        <View className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <WebSection
            className="xl:col-span-2"
            description="Credits are reserved and spent by generated image workflows."
            eyebrow="Balance"
            title="Credits"
          >
            <WebCard padding="md">
              {credits.data ? (
                <View>
                  <WebFieldRow label="Available" value={String(credits.data.available_credits)} />
                  <WebFieldRow label="Reserved" value={String(credits.data.reserved_credits)} />
                  <WebFieldRow
                    label="Monthly grant"
                    value={
                      credits.data.monthly_grant
                        ? `${credits.data.monthly_grant.amount} credits (${credits.data.monthly_grant.tier === 'pro' ? 'Pro' : 'Free'})`
                        : 'No grant yet'
                    }
                  />
                </View>
              ) : credits.isLoading ? (
                <WebLoading fullscreen={false} label="Loading credits..." />
              ) : (
                <Text className="text-body-sm text-app-muted">Credits are unavailable right now.</Text>
              )}

              <View className="mt-8">
                <Text className="mb-4 text-overline text-rose-deep">Buy credits</Text>
                <View className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {CREDIT_PACKAGES.map((pkg) => (
                    <WebPriceCard
                      key={pkg.id}
                      cta={
                        <WebButton
                          isLoading={checkoutPackage === pkg.id}
                          label="Buy credits"
                          onPress={() => handleCreditsCheckout(pkg.id)}
                          size="sm"
                          variant={pkg.id === 'medium' ? 'primary' : 'outline'}
                        />
                      }
                      description={`${pkg.credits} credits`}
                      highlight={pkg.id === 'medium'}
                      price={pkg.price}
                      title={pkg.label}
                      className="min-w-0 p-5"
                    />
                  ))}
                </View>
              </View>
            </WebCard>
          </WebSection>

          <WebSection description="Recent account credit events." eyebrow="Ledger" title="Recent activity">
            <WebCard padding="md">
              <WebTimeline entries={ledgerEntries} emptyLabel="No credit activity yet." />
            </WebCard>
          </WebSection>
        </View>
      </View>
    </WebAppShell>
  );
}

function formatUsage(used: number, limit: number | null): string {
  return limit === null ? `${used} used` : `${used}/${limit}`;
}
