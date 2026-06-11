import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { CompanionListItem } from '@/api/types';
import { PALETTE } from '@/constants/palette';

import { cn } from '../ui/cn';

export type DiscoverCompanionCardProps = {
  companion: CompanionListItem;
  className?: string;
  onPress: () => void;
  /** Large fixed-width variant for horizontal scrollers. */
  size?: 'md' | 'lg';
  /** 1-based rank badge (trending lists). */
  rank?: number;
  /** Overrides the top-left gender pill (e.g. "Yours" in the directory). */
  topLeftLabel?: string;
};

export function DiscoverCompanionCard({ companion, className, onPress, rank, size = 'md', topLeftLabel }: DiscoverCompanionCardProps) {
  const imageSource = mediaSource(companion.art_url);
  const tags = (companion.tags ?? []).slice(0, 2);

  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className={cn(
        'group overflow-hidden rounded-2xl border border-white/10 bg-app-surface shadow-card transition-all duration-200 ease-editorial hover:-translate-y-1 hover:border-app-rose/50 hover:shadow-glow',
        size === 'lg' ? 'w-[220px]' : '',
        className,
      )}
    >
      <View className={cn('relative items-stretch justify-end overflow-hidden bg-[#120A16]', size === 'lg' ? 'h-[300px]' : 'aspect-[3/4]')}>
        {imageSource ? (
          <Image
            accessibilityLabel={companion.name}
            resizeMode="cover"
            source={imageSource}
            className="absolute inset-0 h-full w-full transition-transform duration-300 ease-editorial group-hover:scale-105"
          />
        ) : (
          <View className="absolute inset-0 items-center justify-center">
            <Ionicons color={PALETTE.mutedSoft} name="person-outline" size={40} />
          </View>
        )}

        <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-36 bg-gradient-card-fade" />

        {rank ? (
          <View className="absolute left-2.5 top-2 flex-row items-end gap-0.5">
            <Text className="font-serif text-[26px] font-bold leading-8 text-app-rose drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
              {rank}
            </Text>
          </View>
        ) : (
          <View className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/45 px-2 py-0.5 backdrop-blur">
            <Text className="text-[11px] font-semibold text-app-ink/85">
              {topLeftLabel ?? (companion.gender === 'male' ? 'Male' : 'Female')}
            </Text>
          </View>
        )}

        {companion.play_count > 0 ? (
          <View className="absolute right-2 top-2 flex-row items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2 py-0.5 backdrop-blur">
            <Ionicons color={PALETTE.ember} name="flame" size={11} />
            <Text className="font-mono text-[11px] font-medium text-app-ink/85">{formatCount(companion.play_count)}</Text>
          </View>
        ) : null}

        <View className="gap-1 px-3 pb-3">
          <Text numberOfLines={1} className="font-serif text-body font-semibold text-white">
            {companion.name}
          </Text>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Text numberOfLines={1} className="text-[12px] font-medium text-app-rose-deep">
              {companion.relationship_role ?? 'Companion'}
            </Text>
            {tags.map((tag) => (
              <View key={tag} className="rounded-full bg-white/10 px-1.5 py-px">
                <Text className="text-[10px] font-medium text-app-ink-soft">{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function formatCount(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
