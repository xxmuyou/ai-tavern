import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import {
  getCreditLedger,
  openBillingPortal,
  startCheckout,
  startCreditsCheckout,
} from '@/api/companion-client';
import type { CreditLedgerEntry, CreditLedgerType, CreditPackageId } from '@/api/types';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebLegalLinks } from '@/components/web/WebLegalLinks';
import {
  cn,
  WebButton,
  WebCard,
  WebEmptyState,
  WebFieldRow,
  WebLoading,
  WebSection,
  WebTag,
  WebTimeline,
  type WebTimelineEntry,
} from '@/components/web/ui';
import {
  CREDIT_PACKAGES,
  CREDIT_TASK_COST,
  CUSTOM_COMPANION_LIMIT,
  MONTHLY_CREDIT_GRANT,
  SIGNUP_CREDIT_GRANT,
} from '@/constants/billing';
import { DISCOVER_ROUTE } from '@/constants/routes';
import { useBilling } from '@/hooks/use-billing';
import { useCredits } from '@/hooks/use-credits';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { trackWebEvent, trackWebPageView } from '@/utils/analytics';
import { formatDateTime } from '@/utils/format';
import { openExternalUrl } from '@/utils/linking';

const PRO_FEATURES = [
  `${MONTHLY_CREDIT_GRANT.pro.toLocaleString()} credits every month`,
  'Unlimited custom companions',
  'Buy extra credits any time without changing your plan',
];

const FREE_FEATURES = [
  `${SIGNUP_CREDIT_GRANT.toLocaleString()} credits to get started`,
  `Up to ${CUSTOM_COMPANION_LIMIT.free} custom companions`,
  'Buy extra credits any time without changing your plan',
];

const CREDIT_USES = [
  {
    description: 'Each message that gets a reply uses credits one at a time.',
    icon: 'chatbubble-ellipses-outline' as const,
    title: 'Chat with companions',
  },
  {
    description: 'Generate portraits, moments, and outfit images from the same balance.',
    icon: 'image-outline' as const,
    title: 'Create images',
  },
  {
    description: 'The first voice render for a reply costs credits. Replays stay free.',
    icon: 'mic-outline' as const,
    title: 'Play voice replies',
  },
] as const;

const USAGE_COSTS = [
  {
    detail: 'Per message that returns a reply.',
    icon: 'chatbubble-outline' as const,
    label: 'Chat message',
    value: `${CREDIT_TASK_COST.chat} credit`,
  },
  {
    detail: 'Per generated image.',
    icon: 'image-outline' as const,
    label: 'Image generation',
    value: `${CREDIT_TASK_COST.image} credits`,
  },
  {
    detail: 'First render for a reply. Replays are free.',
    icon: 'volume-high-outline' as const,
    label: 'Voice generation',
    value: `${CREDIT_TASK_COST.voice} credits`,
  },
] as const;

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

function formatPackageExamples(credits: number) {
  const imageCount = Math.floor(credits / CREDIT_TASK_COST.image);
  const chatCount = Math.floor(credits / CREDIT_TASK_COST.chat);
  return {
    chat: `About ${chatCount.toLocaleString()} chats`,
    image: `About ${imageCount.toLocaleString()} images`,
  };
}

function formatSubscriptionStatus(status: string) {
  if (!status) return 'Unknown';
  return status
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function subscriptionTagVariant(status: string) {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'success' as const;
    case 'past_due':
    case 'unpaid':
      return 'warning' as const;
    case 'canceled':
    case 'incomplete_expired':
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
}

type PlanTierCardProps = {
  badge?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  cta?: React.ReactNode;
  description: string;
  features: string[];
  highlight?: boolean;
  price?: string;
  priceUnit?: string;
  title: string;
};

function PlanTierCard({
  badge,
  children,
  className,
  cta,
  description,
  features,
  highlight = false,
  price,
  priceUnit,
  title,
}: PlanTierCardProps) {
  return (
    <View
      className={cn(
        'flex-1 gap-5 rounded-2xl border p-7 transition-shadow',
        highlight
          ? 'border-app-rose/40 bg-gradient-warm shadow-float'
          : 'border-app-line bg-app-surface shadow-card',
        className,
      )}
    >
      <View className="gap-3">
        {badge ? <View className="flex-row flex-wrap items-center justify-between gap-2">{badge}</View> : null}
        <View className="gap-2">
          <Text className="font-serif text-title text-white">{title}</Text>
          <Text className="text-body-sm leading-6 text-rose-50/60">{description}</Text>
        </View>
      </View>

      {price ? (
        <View className="flex-row items-baseline gap-1">
          <Text className="font-serif text-display-md text-white">{price}</Text>
          {priceUnit ? <Text className="text-caption text-rose-50/60">{priceUnit}</Text> : null}
        </View>
      ) : null}

      <View className="gap-2.5">
        {features.map((feature) => (
          <View key={feature} className="flex-row items-start gap-2.5">
            <Ionicons color={highlight ? PALETTE.roseDeep : PALETTE.rose} name="checkmark-circle" size={18} />
            <Text className={cn('flex-1 text-body-sm', highlight ? 'text-app-rose-deep' : 'text-app-ink-soft')}>{feature}</Text>
          </View>
        ))}
      </View>

      {cta ? <View className="mt-2">{cta}</View> : null}
      {children}
    </View>
  );
}

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

  useEffect(() => {
    trackWebPageView('Billing', '/billing');
  }, []);

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
    trackWebEvent('billing_checkout_returned', {
      status: 'success',
    });
    void refetch();
    void credits.refetch();
    void loadLedger();
    const timeout = setTimeout(() => router.replace(DISCOVER_ROUTE), 5000);
    return () => clearTimeout(timeout);
  }, [isSuccess, refetch, credits, loadLedger, router]);

  async function handleCreditsCheckout(pkg: CreditPackageId) {
    setCheckoutPackage(pkg);
    trackWebEvent('billing_checkout_started', {
      checkout_type: 'credits',
      credit_package_id: pkg,
      surface: 'billing',
    });
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
    trackWebEvent('billing_checkout_started', {
      checkout_type: 'subscription',
      surface: 'billing',
    });
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
    trackWebEvent('billing_checkout_started', {
      checkout_type: 'portal',
      surface: 'billing',
    });
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
    <WebAppShell title="Billing" subtitle="See what credits pay for, compare Free and Pro, and top up when you need more.">
      <View className="gap-8">
        <View>
          <Text className="font-serif text-display-sm text-white">Billing</Text>
          <Text className="mt-2 max-w-2xl text-body-sm leading-6 text-rose-50/60">
            See what credits pay for, compare Free and Pro, and top up when you need more.
          </Text>
        </View>

        {isSuccess ? (
          <View className="flex-row items-center gap-3 rounded-2xl border border-app-success/20 bg-app-success/10 px-5 py-4">
            <Ionicons color={PALETTE.success} name="checkmark-circle" size={18} />
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
          <>
            <WebSection
              description="See your current plan first, then decide whether you want to stay on Free or move up to Pro."
              eyebrow="Membership"
              title="Free vs Pro"
            >
              <View className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <PlanTierCard
                  badge={
                    <>
                      <WebTag size="sm" variant="neutral">
                        Free plan
                      </WebTag>
                      {!isPro ? (
                        <WebTag size="sm" variant="brand">
                          Current plan
                        </WebTag>
                      ) : null}
                    </>
                  }
                  description="A flexible starting plan for lighter use, with starter credits and room to top up when needed."
                  features={FREE_FEATURES}
                  title="Free Plan"
                />

                <PlanTierCard
                  badge={
                    <>
                      <View className="flex-row flex-wrap items-center gap-2">
                        <View className="self-start rounded-full bg-app-rose px-2.5 py-0.5">
                          <Text className="text-[11px] font-semibold uppercase tracking-wider text-white">Most loved</Text>
                        </View>
                        {isPro ? (
                          <WebTag size="sm" variant="neutral">
                            Current plan
                          </WebTag>
                        ) : null}
                      </View>
                    </>
                  }
                  cta={
                    isPro ? (
                      <WebButton
                        iconLeft={<Ionicons color={PALETTE.roseDeep} name="settings-outline" size={16} />}
                        isLoading={isOpeningPortal}
                        label="Manage subscription"
                        onPress={handlePortal}
                        variant="primary"
                      />
                    ) : (
                      <WebButton
                        iconLeft={<Ionicons color={PALETTE.roseDeep} name="sparkles-outline" size={16} />}
                        isLoading={isCheckingOut}
                        label="Upgrade to Pro"
                        onPress={handleCheckout}
                        variant="primary"
                      />
                    )
                  }
                  description="A larger monthly credit grant for people who chat and generate images often."
                  features={PRO_FEATURES}
                  highlight
                  price="$9.99"
                  priceUnit="/ month"
                  title="Pro Monthly"
                >
                  {isPro && data ? (
                    <View className="mt-2 border-t border-white/12 pt-4">
                      <WebFieldRow
                        className="border-white/10 py-2.5"
                        label="Status"
                        value={
                          <WebTag size="sm" variant={subscriptionTagVariant(data.subscription.status)}>
                            {formatSubscriptionStatus(data.subscription.status)}
                          </WebTag>
                        }
                      />
                      <WebFieldRow
                        className="border-white/10 py-2.5"
                        label="Next billing date"
                        value={formatDateTime(data.subscription.current_period_end)}
                      />
                    </View>
                  ) : null}
                </PlanTierCard>
              </View>
            </WebSection>

            <WebSection
              description="Use pay as you go credits whenever you need more balance, no matter which plan you are on."
              eyebrow="Top up"
              title="Top up options"
            >
              <View className="gap-5">
                <WebCard padding="md">
                  {credits.data ? (
                    <View>
                      <WebFieldRow label="Available" value={credits.data.available_credits.toLocaleString()} />
                      <WebFieldRow label="Reserved" value={credits.data.reserved_credits.toLocaleString()} />
                      {credits.data.monthly_grant ? (
                        <WebFieldRow
                          label="Monthly grant"
                          value={`${credits.data.monthly_grant.amount.toLocaleString()} credits (${credits.data.monthly_grant.tier === 'pro' ? 'Pro' : 'Free'})`}
                        />
                      ) : null}
                    </View>
                  ) : credits.isLoading ? (
                    <WebLoading fullscreen={false} label="Loading credits..." />
                  ) : (
                    <Text className="text-body-sm text-rose-50/60">Credits are unavailable right now.</Text>
                  )}
                </WebCard>

                <View className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {CREDIT_PACKAGES.map((pkg) => {
                    const examples = formatPackageExamples(pkg.credits);
                    return (
                      <PlanTierCard
                        key={pkg.id}
                        className="min-w-0 p-5"
                        cta={
                          <WebButton
                            isLoading={checkoutPackage === pkg.id}
                            label="Buy credits"
                            onPress={() => handleCreditsCheckout(pkg.id)}
                            size="sm"
                            variant={pkg.id === 'medium' ? 'primary' : 'outline'}
                          />
                        }
                        description={`${pkg.credits.toLocaleString()} credits`}
                        features={[examples.image, examples.chat]}
                        highlight={pkg.id === 'medium'}
                        price={pkg.price}
                        title={pkg.label}
                      />
                    );
                  })}
                </View>
              </View>
            </WebSection>

            <View className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <WebSection
                className="xl:col-span-3"
                description="Recent account credit events, including purchases, grants, and spending."
                eyebrow="Ledger"
                title="Recent activity"
              >
                <WebCard className="min-h-[260px]" padding="md">
                  <ScrollView className="max-h-[340px] min-h-0" contentContainerClassName="pb-1" showsVerticalScrollIndicator>
                    <WebTimeline entries={ledgerEntries} emptyLabel="No credit activity yet." />
                  </ScrollView>
                </WebCard>
              </WebSection>
            </View>

            <WebSection
              description="A quick explainer for how credits are used after you have seen your plan and top-up choices."
              eyebrow="Credits"
              title="What credits do"
            >
              <WebCard padding="lg">
                <View>
                  <Text className="text-overline text-app-rose-deep">What credits unlock</Text>
                  <View className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {CREDIT_USES.map((item) => (
                      <WebCard key={item.title} className="min-w-0" padding="md" variant="sunken">
                        <View className="gap-3">
                          <View className="h-10 w-10 items-center justify-center rounded-full bg-white/6">
                            <Ionicons color={PALETTE.rose} name={item.icon} size={18} />
                          </View>
                          <View className="gap-1.5">
                            <Text className="font-serif text-title text-white">{item.title}</Text>
                            <Text className="text-body-sm leading-6 text-rose-50/65">{item.description}</Text>
                          </View>
                        </View>
                      </WebCard>
                    ))}
                  </View>
                </View>

                <View className="mt-8 border-t border-white/8 pt-8">
                  <Text className="text-overline text-app-rose-deep">Usage cost</Text>
                  <View className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {USAGE_COSTS.map((item) => (
                      <WebCard key={item.label} className="min-w-0" padding="md" variant="sunken">
                        <View className="gap-3">
                          <Ionicons color={PALETTE.rose} name={item.icon} size={18} />
                          <View className="gap-1">
                            <Text className="text-caption uppercase tracking-[0.18em] text-rose-50/55">{item.label}</Text>
                            <Text className="font-serif text-title text-white">{item.value}</Text>
                            <Text className="text-body-sm leading-6 text-rose-50/65">{item.detail}</Text>
                          </View>
                        </View>
                      </WebCard>
                    ))}
                  </View>
                  <Text className="mt-4 text-caption leading-5 text-rose-50/55">
                    System tasks such as summaries and admin prewarm do not spend your balance.
                  </Text>
                </View>
              </WebCard>
            </WebSection>
          </>
        )}
        <View className="border-t border-white/10 pt-5">
          <WebLegalLinks />
        </View>
      </View>
    </WebAppShell>
  );
}
