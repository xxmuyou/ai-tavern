import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';

import { CharaPalLogo } from '@/components/web/CharaPalLogo';
import { WebLegalLinks } from '@/components/web/WebLegalLinks';
import { WebButton } from '@/components/web/ui';
import { BRAND_NAME } from '@/constants/brand';
import { LANDING_CONFIG } from '@/constants/landing';
import { DISCOVER_ROUTE } from '@/constants/routes';
import { PALETTE } from '@/constants/palette';
import { trackWebEvent, trackWebPageView } from '@/utils/analytics';

const HERO_COLLAGE = require('../assets/landing/companion-life-collage.png') as ImageSourcePropType;
const LIFE_MOMENTS_COLLAGE = require('../assets/landing/life-moments-collage.png') as ImageSourcePropType;
const FAIRYTALE_CITY_BACKGROUND = require('../assets/landing/fairytale-city-background.png') as ImageSourcePropType;
const COLLAGE_ASPECT_RATIO = 3 / 2;
const COLLAGE_PREVIEW_WIDTH = 680;

const VALUE_PROPS = [
  {
    description: 'Open the city and see where companions spend their day.',
    icon: 'map-outline' as const,
    title: 'Daily scenes',
  },
  {
    description: 'Friendship, trust, tension, and affection move with the story.',
    icon: 'pulse-outline' as const,
    title: 'Relationship progress',
  },
  {
    description: 'Key moments become a small archive you can return to.',
    icon: 'images-outline' as const,
    title: 'Memories',
  },
  {
    description: 'Start with official characters or shape your own companion.',
    icon: 'sparkles-outline' as const,
    title: 'Create companions',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const config = LANDING_CONFIG;

  useEffect(() => {
    trackWebPageView('Landing', '/landing');
  }, []);

  function openCta(cta: typeof config.primaryCta) {
    trackWebEvent('landing_cta_clicked', {
      cta_id: cta.id,
      destination: String(cta.destination),
    });
    router.push(withLandingAttribution(cta.destination));
  }

  return (
    <View className="h-screen min-h-0 flex-1 overflow-hidden bg-app-canvas">
      <View pointerEvents="none" className="absolute inset-0 bg-app-canvas" />
      <View pointerEvents="none" className="absolute inset-0">
        <Image
          resizeMode="cover"
          source={FAIRYTALE_CITY_BACKGROUND}
          style={{ height: '100%', opacity: 0.38, width: '100%' }}
        />
      </View>
      <View pointerEvents="none" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,7,16,0.94)_0%,rgba(11,7,16,0.78)_46%,rgba(11,7,16,0.62)_100%)]" />
      <View pointerEvents="none" className="absolute inset-x-0 top-0 h-[620px] bg-[radial-gradient(ellipse_at_top,rgba(166,107,250,0.14)_0%,rgba(255,77,126,0.10)_42%,transparent_74%)]" />
      <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-[460px] bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,157,92,0.08)_0%,transparent_68%)]" />

      <ScrollView className="editorial-scroll h-full" contentContainerStyle={{ minHeight: '100%' }}>
        <View className="mx-auto w-full max-w-[1440px] px-5 pb-12 pt-5 md:px-8">
          <View className="mb-8 flex-row items-center justify-between gap-4">
            <Pressable accessibilityRole="link" onPress={() => router.push(DISCOVER_ROUTE)}>
              <CharaPalLogo subtitle="Relationship life sim" />
            </Pressable>
            <WebButton
              label="Open Discover"
              onPress={() => openCta(config.primaryCta)}
              size="sm"
              variant="outline"
            />
          </View>

          <View className="gap-8 lg:flex-row lg:items-center">
            <View className="min-w-0 flex-1 pb-2 pt-4 lg:pr-8">
              <View className="mb-5 self-start rounded-full border border-app-brand/30 bg-app-brand-soft px-3 py-1.5">
                <Text className="text-overline text-app-brand-deep">{config.eyebrow}</Text>
              </View>
              <Text className="max-w-4xl font-serif text-display-md leading-[1.08] text-app-ink md:text-display-xl">
                {config.headline}
              </Text>
              <Text className="mt-5 max-w-2xl text-body-lg leading-8 text-app-ink-soft">
                {config.subcopy}
              </Text>
              <View className="mt-8 flex-row flex-wrap gap-3">
                <WebButton
                  iconRight={<Ionicons color="#FFFFFF" name="arrow-forward" size={17} />}
                  label={config.primaryCta.label}
                  onPress={() => openCta(config.primaryCta)}
                  size="lg"
                />
                <WebButton
                  iconLeft={<Ionicons color={PALETTE.ink} name="sparkles-outline" size={17} />}
                  label={config.secondaryCta.label}
                  onPress={() => openCta(config.secondaryCta)}
                  size="lg"
                  variant="outline"
                />
              </View>
              <View className="mt-8 max-w-2xl flex-row flex-wrap gap-3">
                {['Fictional AI companions', 'PG-13 boundaries', 'No explicit content'].map((item) => (
                  <View key={item} className="flex-row items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                    <Ionicons color={PALETTE.success} name="checkmark-circle" size={14} />
                    <Text className="text-caption font-semibold text-app-ink-soft">{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <HeroProductPreview />
          </View>

          <View className="mt-16 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {VALUE_PROPS.map((item) => (
              <View key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 shadow-card">
                <View className="mb-4 h-10 w-10 items-center justify-center rounded-xl border border-app-rose/25 bg-app-rose-soft">
                  <Ionicons color={PALETTE.roseDeep} name={item.icon} size={19} />
                </View>
                <Text className="font-serif text-title-sm text-app-ink">{item.title}</Text>
                <Text className="mt-2 text-body-sm leading-6 text-app-ink-soft">{item.description}</Text>
              </View>
            ))}
          </View>

          <View className="mt-14 gap-4 lg:flex-row lg:items-start">
            <View className="min-w-0 rounded-2xl border border-white/10 bg-app-solid-panel/80 p-4 shadow-card md:p-5 lg:max-w-[560px]">
              <Text className="text-overline text-app-rose-deep">Built for slow-burn stories</Text>
              <Text className="mt-2 font-serif text-title-sm text-app-ink">
                Meet characters through everyday city moments.
              </Text>
              <Text className="mt-3 max-w-2xl text-body-sm leading-6 text-app-ink-soft">
                {BRAND_NAME} is built around small visits, quiet conversations, and memories that feel like they
                happened somewhere. These moments keep the landing page close to the life-sim promise without turning
                it into a fake chat screenshot.
              </Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {['Cafe sketches', 'Rainy bookshops', 'Rooftop talks', 'Market weekends'].map((label) => (
                  <View key={label} className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
                    <Text className="text-caption font-semibold text-app-ink-soft">{label}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View
              className="max-w-full min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-app-sunken shadow-card"
              style={{ aspectRatio: COLLAGE_ASPECT_RATIO, width: COLLAGE_PREVIEW_WIDTH }}
            >
              <Image resizeMode="cover" source={LIFE_MOMENTS_COLLAGE} style={{ height: '100%', width: '100%' }} />
            </View>
          </View>

          <View className="mt-14 border-t border-white/10 pt-5">
            <WebLegalLinks />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function HeroProductPreview() {
  return (
    <View
      className="min-w-0 flex-1 rounded-[2rem] border border-white/10 bg-app-surface p-2.5 shadow-float"
      style={{ maxWidth: 680, width: '100%' }}
    >
      <View className="relative overflow-hidden rounded-[1.5rem] bg-app-sunken" style={{ aspectRatio: COLLAGE_ASPECT_RATIO, width: '100%' }}>
        <Image
          resizeMode="cover"
          source={HERO_COLLAGE}
          style={{ height: '100%', width: '100%' }}
        />
        <View pointerEvents="none" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,4,9,0.04)_0%,rgba(7,4,9,0.18)_100%)]" />
        <View className="absolute bottom-4 left-4 right-4 flex-row items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur">
          <Text className="min-w-0 flex-1 text-caption font-semibold text-app-ink-soft" numberOfLines={1}>
            A city full of fictional companions, scenes, and small returning moments.
          </Text>
          <View className="h-9 w-9 items-center justify-center rounded-xl border border-app-rose/30 bg-app-rose-soft">
            <Ionicons color={PALETTE.roseDeep} name="sparkles" size={16} />
          </View>
        </View>
      </View>
    </View>
  );
}

function withLandingAttribution(destination: Href): Href {
  if (typeof window === 'undefined') return destination;
  const current = new URLSearchParams(window.location.search);
  const next = new URLSearchParams();
  for (const [key, value] of current.entries()) {
    if (key.startsWith('utm_') || key === 'gclid' || key === 'gbraid' || key === 'wbraid') {
      next.set(key, value);
    }
  }
  const query = next.toString();
  return `${String(destination)}${query ? `?${query}` : ''}` as Href;
}
