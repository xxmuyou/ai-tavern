import { Ionicons } from '@expo/vector-icons';
import { createElement } from 'react';
import { PixelRatio, Pressable, Text, View, type ImageSourcePropType } from 'react-native';
import { getAssetByID } from 'react-native-web/dist/modules/AssetRegistry';

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
  const imageUri = resolveImageUri(imageSource);
  const tags = (companion.tags ?? []).slice(0, 2);

  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className={cn(
        'group overflow-hidden rounded-2xl border border-white/10 bg-app-surface shadow-card transition-all duration-200 ease-editorial hover:-translate-y-1 hover:border-app-rose/50 hover:shadow-glow',
        size === 'lg' ? 'w-[156px]' : '',
        className,
      )}
    >
      <View className={cn('relative overflow-hidden bg-[#120A16]', size === 'lg' ? 'h-[234px]' : 'aspect-[2/3]')}>
        {imageUri ? (
          createElement('img', {
            alt: companion.name,
            src: imageUri,
            style: {
              display: 'block',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center center',
              width: '100%',
            },
          })
        ) : (
          <View className="absolute inset-0 items-center justify-center">
            <Ionicons color={PALETTE.mutedSoft} name="person-outline" size={40} />
          </View>
        )}

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
      </View>

      <View className="min-h-[60px] gap-1 border-t border-white/10 bg-app-surface px-2.5 py-2.5">
        <Text numberOfLines={1} className="font-serif text-body-sm font-semibold text-white">
          {companion.name}
        </Text>
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text numberOfLines={1} className="text-[11px] font-medium text-app-rose-deep">
            {companion.relationship_role ?? 'Companion'}
          </Text>
          {tags.map((tag) => (
            <View key={tag} className="rounded-full bg-white/10 px-1.5 py-px">
              <Text className="text-[9px] font-medium text-app-ink-soft">{tag}</Text>
            </View>
          ))}
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

type WebPackagerAsset = {
  httpServerLocation: string;
  name: string;
  scales: number[];
  type: string;
};

function resolveImageUri(source: ImageSourcePropType | null): string | null {
  if (!source) return null;
  if (typeof source === 'string') return source;
  if (typeof source === 'number') {
    const asset = getAssetByID(source) as WebPackagerAsset | null;
    if (!asset) return null;
    const scale = pickScale(asset.scales);
    const scaleSuffix = scale !== 1 ? `@${scale}x` : '';
    return `${asset.httpServerLocation}/${asset.name}${scaleSuffix}.${asset.type}`;
  }
  if (!Array.isArray(source) && typeof source.uri === 'string') {
    return source.uri;
  }
  return null;
}

function pickScale(scales: number[]): number {
  const preferredScale = PixelRatio.get();
  return scales.reduce((closest, scale) =>
    Math.abs(scale - preferredScale) < Math.abs(closest - preferredScale) ? scale : closest,
  );
}
