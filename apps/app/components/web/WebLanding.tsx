import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, Text, View } from 'react-native';

import { isApiRequestError } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { SCENES_ROUTE } from '@/constants/routes';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSession } from '@/hooks/use-session';

import { WebArticle, WebButton, WebCard, WebFieldRow, WebInput, WebTag } from './ui';

const HERO_IMAGE = require('../../assets/ai-companion/scenes/pier_coffee_shop.png');

const FEATURE_TRIPLES = [
  {
    eyebrow: '01 — Scenes',
    title: 'A modern city, hand-illustrated',
    body:
      'Pier coffee shops, late-night offices, rainy parks, and the rooms between. Every location arrives as a full-bleed illustration with the people you might run into there.',
  },
  {
    eyebrow: '02 — Companions',
    title: 'Characters with their own weather',
    body:
      'Official cast and your own creations. Moods shift, story beats progress, and relationships deepen across dimensions — closeness, trust, romance, and more.',
  },
  {
    eyebrow: '03 — Memories',
    title: 'Moments worth keeping',
    body:
      'Milestones, choices, and milestone composites settle into a quiet album. Look back at where each relationship began, and where it is now.',
  },
];

const PROOF_ROW = [
  { label: 'Daily visits', value: 'One real time-slot' },
  { label: 'Custom companions', value: 'Up to 3 on Free · ∞ on Pro' },
  { label: 'Memory album', value: '30 on Free · Unlimited on Pro' },
];

function signInErrorMessage(error: unknown): string {
  if (isApiRequestError(error) && error.code === 'api_unreachable') {
    return `The API is not reachable at ${error.apiBaseUrl}.`;
  }
  return 'Could not send the sign-in link. Please try again later.';
}

export function WebLanding() {
  const router = useRouter();
  const { sendMagicLink, signInGoogle } = useSession();
  const { pushError } = useErrorBanner();
  const [email, setEmail] = useState('');
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSendLink() {
    const trimmed = email.trim();
    if (!trimmed) {
      pushError('Enter your email address.');
      return;
    }
    setIsSendingLink(true);
    setNotice(null);
    try {
      const response = await sendMagicLink(trimmed);
      if (response.token) {
        router.replace(SCENES_ROUTE);
        return;
      }
      setNotice(response.verify_url ? `Sign-in link is ready for ${trimmed}.` : `A sign-in link has been sent to ${trimmed}.`);
    } catch (error) {
      pushError(signInErrorMessage(error));
    } finally {
      setIsSendingLink(false);
    }
  }

  return (
    <ScrollView className="editorial-scroll h-screen bg-app-canvas" contentContainerStyle={{ flexGrow: 1 }}>
      <View className="mx-auto w-full max-w-[1440px] px-8 py-6">
        {/* Top brand bar */}
        <View className="mb-10 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-rose-soft">
              <Text className="font-serif text-title-sm text-rose-deep">A</Text>
            </View>
            <View>
              <Text className="font-serif text-title-sm text-app-ink">AI Apps Box</Text>
              <Text className="text-caption text-app-muted">A relationship sandbox</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-3">
            <WebTag variant="rose" size="sm">v1 dev</WebTag>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/auth/login')}
              className="rounded-xl border border-app-brand/20 bg-app-brand-soft px-4 py-2 hover:border-app-brand/40 hover:bg-app-brand-soft/80"
            >
              <Text className="text-body-sm font-semibold text-app-brand-deep">Sign in</Text>
            </Pressable>
          </View>
        </View>

        {/* Hero */}
        <View className="overflow-hidden rounded-3xl border border-app-line shadow-float">
          <ImageBackground source={HERO_IMAGE} resizeMode="cover" className="min-h-[560px] justify-end">
            <View className="absolute inset-0 bg-gradient-to-b from-app-twilight/10 via-app-twilight/30 to-app-twilight/75" />
            <View className="absolute inset-0 bg-gradient-glow" />
            <View className="relative w-full px-12 py-14 xl:px-16">
              <WebTag variant="rose" size="md" className="bg-app-surface/85 backdrop-blur">Today, in the city</WebTag>
              <Text className="mt-5 max-w-3xl font-serif text-display-2xl leading-[1.04] text-white">
                A small city for the people{'\n'}you actually want to see.
              </Text>
              <Text className="mt-5 max-w-xl text-body-lg leading-7 text-white/85">
                Pick a scene, walk in, and meet the companion waiting there. The conversations you have today change the conversations you can have tomorrow.
              </Text>
            </View>
          </ImageBackground>

          {/* Login card sits below the hero, full-width row, two columns */}
          <View className="grid grid-cols-1 gap-10 px-12 py-12 xl:grid-cols-[1.4fr_1fr] xl:px-16">
            <View className="gap-4">
              <Text className="text-overline text-rose-deep">What is this</Text>
              <Text className="font-serif text-display-sm text-app-ink">
                A relationship sandbox that grows with you.
              </Text>
              <Text className="max-w-2xl text-body-lg leading-7 text-app-ink-soft">
                Sign in once and your companions, scenes, memories, and subscription travel with you across web, iOS, and Android. The dev workspace is open — explore freely, talk often, and see what the day turns into.
              </Text>
              <View className="mt-2 flex-row flex-wrap items-center gap-2">
                {['Scenes that breathe', 'Streaming chat', 'Memory album', 'Admin tools'].map((label) => (
                  <View key={label} className="flex-row items-center gap-1.5 rounded-full bg-rose-soft px-3 py-1.5">
                    <Ionicons color="#9A2F4F" name="checkmark-circle" size={14} />
                    <Text className="text-caption font-semibold text-rose-deep">{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <WebCard padding="lg" variant="elevated" className="self-start">
              <Text className="text-overline text-rose-deep">Get started</Text>
              <Text className="mt-1 font-serif text-title text-app-ink">Sign in to your sandbox</Text>
              <Text className="mt-1.5 text-caption text-app-muted">Continue with Google or get a magic link by email.</Text>

              <View className="mt-6 gap-3">
                <WebButton
                  iconLeft={<Ionicons color="#3B6EA5" name="logo-google" size={18} />}
                  label="Continue with Google"
                  onPress={signInGoogle}
                  variant="google"
                  size="lg"
                />
                <View className="my-1 flex-row items-center gap-3">
                  <View className="h-px flex-1 bg-app-line" />
                  <Text className="text-overline text-app-muted">or email</Text>
                  <View className="h-px flex-1 bg-app-line" />
                </View>
                <WebInput
                  autoCapitalize="none"
                  autoComplete="email"
                  inputMode="email"
                  label="Email address"
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  value={email}
                />
                <WebButton
                  isLoading={isSendingLink}
                  label="Send sign-in link"
                  onPress={handleSendLink}
                  variant="outline"
                  size="lg"
                />
                {notice ? <Text className="text-caption text-rose-deep">{notice}</Text> : null}
                <Text className="text-caption text-app-muted">
                  We will email a one-time link. Open it on this device to sign in.
                </Text>
              </View>
            </WebCard>
          </View>
        </View>

        {/* Feature trio */}
        <View className="mt-20">
          <WebArticle
            eyebrow="What you can do"
            title="Three loops, woven into one day."
            lead="Each piece is its own little surface. Together they make a city that feels lived-in, not scripted."
          />
          <View className="mt-10 grid grid-cols-1 gap-6 xl:grid-cols-3">
            {FEATURE_TRIPLES.map((feature) => (
              <WebCard key={feature.eyebrow} padding="lg" className="gap-3">
                <Text className="text-overline text-rose-deep">{feature.eyebrow}</Text>
                <Text className="font-serif text-title text-app-ink">{feature.title}</Text>
                <Text className="text-body-sm leading-6 text-app-ink-soft">{feature.body}</Text>
              </WebCard>
            ))}
          </View>
        </View>

        {/* Proof row */}
        <View className="mt-20 grid grid-cols-1 gap-4 rounded-3xl border border-app-line bg-app-sunken/40 p-10 sm:grid-cols-3">
          {PROOF_ROW.map((row) => (
            <View key={row.label} className="gap-2 border-l-2 border-rose/70 pl-4">
              <Text className="text-overline text-rose-deep">{row.label}</Text>
              <Text className="font-serif text-title text-app-ink">{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View className="mt-20 flex-row flex-wrap items-center justify-between gap-6 border-t border-app-line pt-10 pb-6">
          <View className="flex-row items-center gap-3">
            <View className="h-7 w-7 items-center justify-center rounded-full bg-rose-soft">
              <Text className="font-serif text-caption text-rose-deep">A</Text>
            </View>
            <View>
              <Text className="font-serif text-body-sm text-app-ink">AI Apps Box</Text>
              <Text className="text-caption text-app-muted">© 2026 · A relationship sandbox</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-6 text-app-muted">
            <Text className="text-caption">Built for the web.</Text>
            <Text className="text-caption">v1 — English first.</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
