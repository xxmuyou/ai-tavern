import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { CompanionListItem } from '@/api/types';
import { WebAuthControls } from '@/components/web/WebAuthControls';
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

  function openCompanion(companion: CompanionListItem) {
    const target = `/companion/${encodeURIComponent(companion.id)}` as Href;
    if (session) {
      router.push(target);
      return;
    }
    router.push(`/auth/login?redirect=${encodeURIComponent(String(target))}` as Href);
  }

  return (
    <View className="h-screen overflow-hidden bg-[#10070d]">
      <View pointerEvents="none" className="absolute inset-0 bg-[#10070d]" />
      <View pointerEvents="none" className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(201,72,107,0.38)_0%,rgba(93,24,54,0.24)_38%,transparent_72%)]" />
      <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-[360px] bg-[radial-gradient(ellipse_at_bottom,rgba(217,119,87,0.16)_0%,transparent_70%)]" />

      <ScrollView className="editorial-scroll h-full" contentContainerStyle={{ minHeight: '100%' }}>
        <View className="relative mx-auto w-full max-w-[1600px] px-8 py-6">
          <View className="sticky top-0 z-20 mb-8 flex-row items-center justify-between border-b border-white/10 bg-[#10070d]/88 px-1 py-4 backdrop-blur">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl border border-rose-300/20 bg-white/8">
                <Text className="font-serif text-title-sm text-rose-100">A</Text>
              </View>
              <View>
                <Text className="font-serif text-title-sm text-white">AI Apps Box</Text>
                <Text className="text-caption text-rose-100/62">Choose who pulls you in first.</Text>
              </View>
            </View>
            <WebAuthControls />
          </View>

          <View className="mb-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
            <View className="justify-end pb-2">
              <Text className="text-overline text-rose-200/70">Companion discovery</Text>
              <Text className="mt-4 max-w-2xl font-serif text-display-xl leading-[1.04] text-white">
                Pick the face you want to meet tonight.
              </Text>
              <Text className="mt-5 max-w-xl text-body-lg leading-7 text-rose-50/70">
                Browse the public cast before signing in. Choose a preference, open a profile, and start the first conversation when you are ready.
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
              description="The public companion list could not be loaded."
              icon="alert-circle-outline"
              onAction={refetch}
              title="Discovery unavailable"
            />
          ) : items.length === 0 ? (
            <DarkState
              actionLabel="Switch style"
              description="No companions match this combination yet."
              icon="moon-outline"
              onAction={() => setArtStyle(artStyle === 'anime' ? 'realistic' : 'anime')}
              title="No one in this room"
            />
          ) : (
            <View className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-5">
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
        </View>
      </ScrollView>
    </View>
  );
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
          className="mt-6 min-h-11 items-center justify-center rounded-xl border border-rose-200/30 bg-rose-200 px-5"
        >
          <Text className="text-body-sm font-semibold text-[#2a0712]">{actionLabel}</Text>
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
                active ? 'bg-rose-200 shadow-[0_10px_30px_rgba(251,113,133,0.22)]' : 'hover:bg-white/8'
              }`}
            >
              <Text className={`text-body-sm font-semibold ${active ? 'text-[#2a0712]' : 'text-rose-50/72'}`}>{option.label}</Text>
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
      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055] shadow-[0_18px_48px_rgba(0,0,0,0.32)] transition-transform hover:-translate-y-1 hover:border-rose-200/40"
    >
      <View className="relative aspect-[3/4] items-center justify-end overflow-hidden bg-[#1b0d15]">
        <View pointerEvents="none" className="absolute inset-0" style={{ backgroundColor: accent }} />
        <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent" />
        {imageSource ? (
          <Image accessibilityLabel={companion.name} resizeMode="contain" source={imageSource} style={cardStyles.portrait} />
        ) : null}
        <View className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/36 px-3 py-1 backdrop-blur">
          <Text className="text-caption font-semibold text-rose-50/82">{companion.gender === 'male' ? 'Male' : 'Female'}</Text>
        </View>
      </View>
      <View className="gap-2 p-4">
        <Text numberOfLines={1} className="font-serif text-title-sm text-white">{companion.name}</Text>
        <View className="flex-row items-center gap-2">
          <Ionicons color="#fecdd3" name="chatbubble-ellipses-outline" size={13} />
          <Text numberOfLines={1} className="text-caption text-rose-100/62">
            {companion.relationship_role ?? 'Companion'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  portrait: {
    height: '108%',
    transform: [{ translateY: 10 }],
    width: '108%',
  },
});
