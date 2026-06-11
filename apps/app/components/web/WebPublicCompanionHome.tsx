import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL, isApiRequestError, mediaSource } from '@/api/companion-client';
import type { CompanionListItem } from '@/api/types';
import { WebAppShell } from '@/components/web/WebAppShell';
import { usePublicCompanions, type CompanionDiscoveryStyle } from '@/hooks/use-companions';
import { useSession } from '@/hooks/use-session';

type GenderFilter = 'female' | 'male';

const GENDER_OPTIONS: { id: GenderFilter; label: string }[] = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
];

const STYLE_OPTIONS: { id: CompanionDiscoveryStyle; label: string }[] = [
  { id: 'anime', label: 'Anime' },
  { id: 'realistic', label: 'Realistic' },
];

export function WebPublicCompanionHome() {
  const router = useRouter();
  const { session } = useSession();
  const [gender, setGender] = useState<GenderFilter>('female');
  const [artStyle, setArtStyle] = useState<CompanionDiscoveryStyle>('anime');
  const { data, error, isLoading, refetch } = usePublicCompanions({ artStyle, gender, sort: 'popular' });
  const items = (data?.items ?? []).filter((item) => item.art_url);
  const discoveryError = getDiscoveryError(error);

  function openCompanion(companion: CompanionListItem) {
    const target = `/companion/${encodeURIComponent(companion.id)}` as Href;
    if (session) {
      router.push(target);
      return;
    }
    router.push(`/auth/login?redirect=${encodeURIComponent(String(target))}` as Href);
  }

  return (
    <WebAppShell maxWidth="3xl" requireAuth={false} title="Discover">
      <View pointerEvents="none" className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(201,72,107,0.32)_0%,rgba(93,24,54,0.20)_38%,transparent_72%)]" />
      <View className="mb-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <View className="justify-end pb-2">
          <Text className="text-overline text-rose-200/70">Companion discovery</Text>
          <Text className="mt-4 max-w-2xl font-serif text-display-xl leading-[1.04] text-white">
            Pick the face you want to meet tonight.
          </Text>
          <Text className="mt-5 max-w-xl text-body-lg leading-7 text-rose-50/70">
            Browse the public cast, choose a preference, open a profile, and start the first conversation when you are ready.
          </Text>
        </View>

        <View className="self-end rounded-2xl border border-white/10 bg-white/[0.055] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur">
          <View className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FilterGroup
              icon="male-female-outline"
              label="Preference"
              options={GENDER_OPTIONS}
              value={gender}
              onChange={(value) => setGender(value as GenderFilter)}
            />
            <FilterGroup
              icon="sparkles-outline"
              label="Visual style"
              options={STYLE_OPTIONS}
              value={artStyle}
              onChange={(value) => setArtStyle(value as CompanionDiscoveryStyle)}
            />
          </View>
        </View>
      </View>

      {isLoading ? (
        <DarkState icon="sparkles-outline" title="Opening the room..." />
      ) : error ? (
        <DarkState
          actionLabel="Try again"
          description={discoveryError.description}
          icon="alert-circle-outline"
          onAction={refetch}
          title={discoveryError.title}
        />
      ) : items.length === 0 ? (
        <DarkState
          actionLabel="Switch style"
          description="No characters match this combination yet."
          icon="moon-outline"
          onAction={() => setArtStyle(artStyle === 'anime' ? 'realistic' : 'anime')}
          title="No one in this room"
        />
      ) : (
        <View className="grid grid-cols-3 gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
          {items.map((companion, index) => (
            <DiscoveryCard
              key={companion.id}
              companion={companion}
              index={index}
              onPress={() => openCompanion(companion)}
            />
          ))}
        </View>
      )}
    </WebAppShell>
  );
}

function getDiscoveryError(error: Error | null): { description: string; title: string } {
  if (isApiRequestError(error) && error.code === 'api_unreachable' && API_BASE_URL.includes('127.0.0.1:8787')) {
    return {
      description: 'Start the local API with pnpm run:local:api, or use pnpm run:local to run the local API and web app together.',
      title: `Local API is not reachable at ${API_BASE_URL}`,
    };
  }
  return {
    description: 'The public companion list could not be loaded.',
    title: 'Discovery unavailable',
  };
}

function DarkState({
  actionLabel,
  description,
  icon,
  onAction,
  title,
}: {
  actionLabel?: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
  title: string;
}) {
  const isLoading = !actionLabel && !description;
  return (
    <View className="min-h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-8 py-16">
      <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl border border-rose-200/20 bg-rose-200/10">
        {isLoading ? <ActivityIndicator color="#fecdd3" /> : <Ionicons color="#fecdd3" name={icon} size={24} />}
      </View>
      <Text className="text-center font-serif text-title text-white">{title}</Text>
      {description ? <Text className="mt-2 max-w-md text-center text-body-sm leading-6 text-rose-50/62">{description}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          className="mt-6 min-h-11 items-center justify-center rounded-xl border border-rose-200/30 bg-rose-400/20 px-5 hover:bg-rose-400/26"
        >
          <Text className="text-body-sm font-semibold text-rose-50">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FilterGroup({
  icon,
  label,
  onChange,
  options,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  value: string;
}) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Ionicons color="#fecdd3" name={icon} size={15} />
        <Text className="text-overline text-rose-100/65">{label}</Text>
      </View>
      <View className="flex-row rounded-xl border border-white/10 bg-black/20 p-1">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.id)}
              className={`min-h-11 flex-1 items-center justify-center rounded-lg px-4 ${
                active ? 'bg-rose-400/22 shadow-[0_10px_30px_rgba(251,113,133,0.22)]' : 'hover:bg-white/8'
              }`}
            >
              <Text className={`text-body-sm font-semibold ${active ? 'text-rose-50' : 'text-rose-50/72'}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DiscoveryCard({ companion, index, onPress }: { companion: CompanionListItem; index: number; onPress: () => void }) {
  const imageSource = mediaSource(companion.art_url);
  const accent = index % 3 === 0 ? 'rgba(251,113,133,0.28)' : index % 3 === 1 ? 'rgba(244,114,182,0.22)' : 'rgba(251,146,60,0.18)';

  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.055] shadow-[0_14px_36px_rgba(0,0,0,0.28)] transition-transform hover:-translate-y-0.5 hover:border-rose-200/40"
    >
      <View className="relative aspect-[5/6] items-center justify-end overflow-hidden bg-[#1b0d15]">
        <View pointerEvents="none" className="absolute inset-0" style={{ backgroundColor: accent }} />
        <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
        {imageSource ? (
          <Image accessibilityLabel={companion.name} resizeMode="contain" source={imageSource} style={cardStyles.portrait} />
        ) : null}
        <View className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/36 px-2 py-0.5 backdrop-blur">
          <Text className="text-[11px] font-semibold text-rose-50/82">{companion.gender === 'male' ? 'Male' : 'Female'}</Text>
        </View>
      </View>
      <View className="gap-1.5 p-3">
        <Text numberOfLines={1} className="font-serif text-body font-semibold text-white">{companion.name}</Text>
        <View className="flex-row items-center gap-1.5">
          <Ionicons color="#fecdd3" name="chatbubble-ellipses-outline" size={12} />
          <Text numberOfLines={1} className="text-[12px] font-medium text-rose-100/62">
            {companion.relationship_role ?? 'Companion'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  portrait: {
    height: '88%',
    transform: [{ translateY: 6 }],
    width: '88%',
  },
});
