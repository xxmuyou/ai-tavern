import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { fetchMe, listImageAssets, mediaSource, openBillingPortal, updateRomancePreference } from '@/api/companion-client';
import type { MeResponse, RomancePreference, UserImageAsset } from '@/api/types';
import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { ADMIN_ROUTE, BILLING_ROUTE, PERSONAS_ROUTE } from '@/constants/routes';
import { useBilling } from '@/hooks/use-billing';
import { useCredits } from '@/hooks/use-credits';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { usePush } from '@/hooks/use-push';
import { useSession } from '@/hooks/use-session';
import { formatDateTime, formatProvider } from '@/utils/format';
import { openExternalUrl } from '@/utils/linking';

export default function MeScreen() {
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const { session, signOut } = useSession();
  const { data: billing, refetch: refetchBilling } = useBilling();
  const { data: credits } = useCredits();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [imageAssets, setImageAssets] = useState<UserImageAsset[]>([]);
  const push = usePush(me?.push_enabled);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadMe() {
      try {
        const [payload, assets] = await Promise.all([
          fetchMe(),
          listImageAssets().catch(() => ({ assets: [] })),
        ]);
        if (isMounted) {
          setMe(payload);
          setImageAssets(assets.assets);
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

          <Section title="Romance preference">
            <Text className="text-sm leading-5 text-app-muted">
              Affects which companions show up most often in scenes. Change anytime.
            </Text>
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
                <Text className="text-sm leading-5 text-app-muted">Free includes 1,000 credits each month and 3 custom companions.</Text>
                <Button label="Upgrade to Pro" onPress={() => router.push(BILLING_ROUTE)} />
              </>
            )}
          </Section>

          <Section title="Credits">
            <InfoRow label="Available" value={credits ? credits.available_credits.toLocaleString() : '—'} />
            <InfoRow label="Reserved" value={credits ? credits.reserved_credits.toLocaleString() : '—'} />
            <Text className="text-sm leading-5 text-app-muted">
              Credits power every chat and image. Top up or see history on the billing page.
            </Text>
            <Button label="Manage credits" onPress={() => router.push(BILLING_ROUTE)} variant="secondary" />
          </Section>

          <Section title="Personas">
            <Text className="text-sm leading-5 text-app-muted">
              Who you play as in chat. Characters use your persona to know who they are talking to.
            </Text>
            <Button label="Manage personas" onPress={() => router.push(PERSONAS_ROUTE)} variant="secondary" />
          </Section>

          <Section title="My image assets">
            <ImageAssetGrid assets={imageAssets} />
          </Section>

          <Section title="Push notifications">
            <View className="flex-row items-center justify-between gap-4">
              <View className="min-w-0 flex-1">
                <Text className="text-base font-semibold text-app-text">Daily relationship prompts</Text>
                <Text className="mt-1 text-sm leading-5 text-app-muted">
                  {Platform.OS === 'web' ? 'Browser push is not enabled for web.' : push.permissionStatus === 'denied' ? 'Permission was denied.' : 'One mobile notification per day at most.'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: push.enabled }}
                disabled={push.isLoading || Platform.OS === 'web'}
                onPress={() => void push.setPushEnabled(!push.enabled)}
                className={`h-8 w-14 justify-center rounded-full px-1 ${push.enabled ? 'bg-app-primary' : 'bg-app-line'} ${
                  push.isLoading || Platform.OS === 'web' ? 'opacity-50' : 'opacity-100'
                }`}
              >
                <View className={`h-6 w-6 rounded-full bg-white ${push.enabled ? 'self-end' : 'self-start'}`} />
              </Pressable>
            </View>
            {push.error ? <Text className="text-sm text-app-warning">{push.error}</Text> : null}
          </Section>

          <Section title="Other">
            <InfoRow label="Version" value={version} />
            {me?.is_admin ? (
              <Button label="Admin workspace" onPress={() => router.push(ADMIN_ROUTE)} variant="secondary" />
            ) : null}
            <Button isLoading={isSigningOut} label="Sign out" onPress={handleSignOut} variant="secondary" />
          </Section>
        </View>
      </ScrollView>
    </View>
  );
}

function ImageAssetGrid({ assets }: { assets: UserImageAsset[] }) {
  if (!assets.length) {
    return <Text className="text-sm text-app-muted">No saved images yet.</Text>;
  }

  return (
    <View className="flex-row flex-wrap gap-3">
      {assets.map((asset) => {
        const source = mediaSource(asset.art_key);
        return (
          <View key={asset.id} className="w-[30%] min-w-[92px] overflow-hidden rounded-lg border border-app-line bg-app-primarySoft">
            {source ? (
              <Image accessibilityLabel="Saved image asset" resizeMode="cover" source={source} className="aspect-[4/5] w-full" />
            ) : (
              <View className="aspect-[4/5] w-full items-center justify-center">
                <Text className="text-xs text-app-muted">Image</Text>
              </View>
            )}
          </View>
        );
      })}
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

const PREFERENCE_OPTIONS: { label: string; value: RomancePreference }[] = [
  { label: 'Women', value: 'female' },
  { label: 'Men', value: 'male' },
  { label: 'Anyone', value: 'any' },
];

function PreferencePicker({
  value,
  onChange,
}: {
  value: RomancePreference;
  onChange: (next: RomancePreference) => void;
}) {
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
            className={`flex-1 items-center rounded-full border px-4 py-2 ${
              active ? 'border-app-primary bg-app-primary' : 'border-app-line bg-app-card'
            }`}
          >
            <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-app-text'}`}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
