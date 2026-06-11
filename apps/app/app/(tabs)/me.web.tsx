import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import {
  deleteImageAsset,
  fetchMe,
  listImageAssets,
  mediaSource,
  mediaUrl,
  openBillingPortal,
  updateRomancePreference,
} from '@/api/companion-client';
import type { MeResponse, RomancePreference, UserImageAsset } from '@/api/types';
import { LoadingScreen } from '@/components/LoadingScreen';
import { WebAppShell } from '@/components/web/WebAppShell';
import {
  WebAvatar,
  WebButton,
  WebCard,
  WebEmptyState,
  WebFieldRow,
  WebSection,
  WebTag,
} from '@/components/web/ui';
import { ADMIN_ROUTE, BILLING_ROUTE, PERSONAS_ROUTE } from '@/constants/routes';
import { useBilling } from '@/hooks/use-billing';
import { useCredits } from '@/hooks/use-credits';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { usePush } from '@/hooks/use-push';
import { useSession } from '@/hooks/use-session';
import { formatDateTime, formatProvider } from '@/utils/format';
import { openExternalUrl } from '@/utils/linking';

const PREFERENCE_OPTIONS: { label: string; value: RomancePreference }[] = [
  { label: 'Women', value: 'female' },
  { label: 'Men', value: 'male' },
  { label: 'Anyone', value: 'any' },
];

export default function WebMeScreen() {
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const { session, signOut } = useSession();
  const { data: billing, refetch: refetchBilling } = useBilling();
  const { data: credits } = useCredits();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [imageAssets, setImageAssets] = useState<UserImageAsset[]>([]);
  const push = usePush(me?.push_enabled);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([fetchMe(), listImageAssets().catch(() => ({ assets: [] }))])
      .then(([payload, assets]) => {
        if (mounted) {
          setMe(payload);
          setImageAssets(assets.assets);
        }
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
  const providers = me?.linked_providers?.length ? me.linked_providers : ['email'];

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

  async function handleDeleteImageAsset(id: string) {
    const previous = imageAssets;
    setImageAssets((current) => current.filter((asset) => asset.id !== id));
    try {
      await deleteImageAsset(id);
    } catch {
      setImageAssets(previous);
      pushError('Could not delete that image asset.');
    }
  }

  return (
    <WebAppShell title="Me" subtitle="Account, subscription, usage, and workspace controls.">
      <View className="grid grid-cols-1 gap-8 xl:grid-cols-[340px_1fr]">
        {/* Profile card */}
        <View className="gap-5">
          <WebCard padding="lg" className="items-center gap-5">
            <WebAvatar
              fallback={displayName}
              ring="rose"
              size="2xl"
              source={null}
            />
            <View className="items-center gap-1.5">
              <Text className="font-serif text-title text-app-ink">{displayName}</Text>
              <Text className="text-body-sm text-app-muted">{email}</Text>
            </View>
            <View className="flex-row flex-wrap justify-center gap-1.5">
              {providers.map((provider) => (
                <WebTag key={provider} size="sm" variant="brand">
                  {formatProvider(provider)}
                </WebTag>
              ))}
            </View>
            <View className="w-full border-t border-app-line-soft pt-5">
              <View className="flex-row items-center justify-between gap-3">
                <View>
                  <Text className="text-overline text-app-muted">Plan</Text>
                  <Text className="mt-1 font-serif text-title-sm text-app-ink">{isPro ? 'Pro' : 'Free'}</Text>
                </View>
                <WebTag size="sm" variant={isPro ? 'rose' : 'neutral'}>
                  {isPro ? 'Unlocked' : 'Upgrade me'}
                </WebTag>
              </View>
            </View>
            <View className="w-full gap-2">
              {me?.is_admin ? (
                <WebButton
                  label="Admin workspace"
                  onPress={() => router.push(ADMIN_ROUTE)}
                  variant="outline"
                  iconLeft={<Ionicons color={PALETTE.ink} name="shield-checkmark-outline" size={16} />}
                />
              ) : null}
              <WebButton
                label="Sign out"
                onPress={() => void signOut()}
                variant="ghost"
                iconLeft={<Ionicons color={PALETTE.inkSoft} name="log-out-outline" size={16} />}
              />
            </View>
          </WebCard>
        </View>

        {/* Sections */}
        <View className="gap-8">
          <WebSection eyebrow="Profile" title="Account" description="Identity and the build of the app you're running.">
            <WebCard padding="md">
              <WebFieldRow label="Display name" value={displayName} />
              <WebFieldRow label="Email" value={email} />
              <WebFieldRow label="Email verified" value={me?.email_verified ? 'Yes' : 'No'} />
              <WebFieldRow label="Version" value={Constants.expoConfig?.version ?? '0.1.0'} />
            </WebCard>
          </WebSection>

          <WebSection
            eyebrow="Story"
            title="Romance preference"
            description="A soft hint that steers which companions are recommended for you."
          >
            <WebCard padding="md">
              <View className="flex-row flex-wrap gap-2">
                {PREFERENCE_OPTIONS.map((opt) => {
                  const active = opt.value === (me?.romance_preference ?? 'any');
                  return (
                    <Pressable
                      key={opt.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        if (active || !me) return;
                        const previous = me.romance_preference;
                        setMe({ ...me, romance_preference: opt.value });
                        void updateRomancePreference(opt.value).catch(() => {
                          setMe({ ...me, romance_preference: previous });
                          pushError('Could not update preference.');
                        });
                      }}
                      className={`min-w-[100px] rounded-full border px-5 py-2.5 ${
                        active ? 'border-rose bg-app-rose-soft shadow-glow-soft' : 'border-app-line bg-app-canvas/70 hover:bg-app-brand-soft/70'
                      }`}
                    >
                      <Text
                        className={`text-center text-body-sm font-semibold ${
                          active ? 'text-app-rose-deep' : 'text-app-ink-soft'
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </WebCard>
          </WebSection>

          <WebSection
            eyebrow="Plan"
            title="Subscription and credits"
            description="Where you are on the journey and how many credits you have to spend."
          >
            <WebCard padding="md">
              <WebFieldRow label="Plan" value={isPro ? 'Pro' : 'Free'} />
              <WebFieldRow label="Status" value={billing?.subscription.status ?? '—'} />
              <WebFieldRow label="Credits available" value={credits ? credits.available_credits.toLocaleString() : '—'} />
              <WebFieldRow label="Credits reserved" value={credits ? credits.reserved_credits.toLocaleString() : '—'} />
              <WebFieldRow
                label="Next billing date"
                value={formatDateTime(billing?.subscription.current_period_end ?? me?.subscription.current_period_end)}
              />
              <View className="mt-5 flex-row flex-wrap gap-3">
                {isPro ? (
                  <WebButton
                    label="Manage subscription"
                    isLoading={isOpeningPortal}
                    onPress={handlePortal}
                    variant="primary"
                    iconLeft={<Ionicons color={PALETTE.roseDeep} name="settings-outline" size={16} />}
                  />
                ) : (
                  <WebButton
                    label="Upgrade to Pro"
                    onPress={() => router.push(BILLING_ROUTE)}
                    variant="primary"
                    iconLeft={<Ionicons color={PALETTE.roseDeep} name="sparkles-outline" size={16} />}
                  />
                )}
              </View>
            </WebCard>
          </WebSection>

          <WebSection
            eyebrow="Identity"
            title="Personas"
            description="Who you play as in chat. Characters use your persona to know who they are talking to."
          >
            <WebButton
              label="Manage personas"
              onPress={() => router.push(PERSONAS_ROUTE)}
              variant="outline"
              iconLeft={<Ionicons color={PALETTE.ink} name="person-outline" size={16} />}
            />
          </WebSection>

          <WebSection eyebrow="Atelier" title="My image assets" description="Generations you've saved into your workspace.">
            <ImageAssetGrid assets={imageAssets} onDelete={handleDeleteImageAsset} />
          </WebSection>

          <WebSection
            eyebrow="Reach"
            title="Push notifications"
            description="Daily relationship prompts can be enabled inside the native app. Browser push is not part of v1."
          >
            <WebCard padding="md">
              <View className="flex-row items-center justify-between gap-4">
                <View className="min-w-0 flex-1">
                  <Text className="text-body-sm font-semibold text-app-ink">Daily relationship prompts</Text>
                  <Text className="mt-1 text-caption text-app-muted">
                    {push.enabled ? 'Enabled' : 'Currently off — open the app to switch it on.'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: push.enabled, disabled: true }}
                  disabled
                  className="h-7 w-12 justify-center rounded-full border border-app-line bg-app-sunken/60 px-0.5 opacity-50"
                >
                  <View
                    className={`h-6 w-6 rounded-full bg-white shadow-card ${
                      push.enabled ? 'self-end' : 'self-start'
                    }`}
                  />
                </Pressable>
              </View>
            </WebCard>
          </WebSection>
        </View>
      </View>
    </WebAppShell>
  );
}

function ImageAssetGrid({ assets, onDelete }: { assets: UserImageAsset[]; onDelete: (id: string) => void }) {
  if (!assets.length) {
    return (
      <WebCard padding="md" className="items-center">
        <WebEmptyState
          title="No saved images yet"
          description="Portraits and story composites you generate will be saved here."
          icon="image-outline"
        />
      </WebCard>
    );
  }

  return (
    <View className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((asset) => {
        const source = mediaSource(asset.art_key);
        return (
          <View
            key={asset.id}
            className="overflow-hidden rounded-2xl border border-app-line bg-app-surface shadow-card"
          >
            {source ? (
              <Image
                accessibilityLabel="Saved image asset"
                resizeMode="cover"
                source={source}
                className="aspect-[4/5] w-full"
              />
            ) : (
              <View className="aspect-[4/5] w-full items-center justify-center bg-app-sunken">
                <Ionicons color={PALETTE.muted} name="image-outline" size={24} />
              </View>
            )}
            <View className="gap-2 p-3">
              <Text className="text-caption text-app-muted">{asset.source === 'generated' ? 'Generated image' : 'Uploaded image'}</Text>
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => downloadAsset(asset)}
                  className="rounded-full border border-app-line bg-app-canvas px-3 py-1.5"
                >
                  <Text className="text-xs font-semibold text-app-ink-soft">Download</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onDelete(asset.id)}
                  className="rounded-full border border-app-danger/25 bg-app-danger-soft px-3 py-1.5"
                >
                  <Text className="text-xs font-semibold text-app-danger">Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function downloadAsset(asset: UserImageAsset): void {
  const url = mediaUrl(asset.art_key);
  if (!url) return;
  if (typeof document !== 'undefined') {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = asset.art_key.split('/').pop() ?? 'xtbit-image';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    return;
  }
  openExternalUrl(url);
}
