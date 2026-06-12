import { Image, StyleSheet, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { Memory } from '@/api/types';
import { milestoneOverlay } from '@/utils/milestone-cg';

type MemoryCardProps = {
  memory: Memory;
  portraitUrl?: string | null;
};

export function MemoryCard({ memory, portraitUrl }: MemoryCardProps) {
  const sceneImage = mediaSource(memory.cg_url ?? memory.scene?.art_url ?? null);
  const portrait = mediaSource(portraitUrl);
  const hasCg = Boolean(memory.cg_url || memory.cg_template);
  const overlay = milestoneOverlay(memory.cg_template);

  return (
    <View className="overflow-hidden rounded-lg border border-app-line bg-app-card">
      {hasCg && sceneImage ? (
        <View className="aspect-video overflow-hidden bg-app-primarySoft">
          <Image source={sceneImage} resizeMode="cover" style={{ height: '100%', width: '100%' }} />
          <View className="absolute inset-0 bg-black/15" />
          {portrait ? (
            <Image source={portrait} resizeMode="contain" style={styles.portrait} />
          ) : null}
          {overlay ? (
            <View className="absolute left-3 top-3 rounded-full px-3 py-1" style={{ backgroundColor: overlay.accent }}>
              <Text className="text-xs font-semibold text-white">{overlay.label}</Text>
            </View>
          ) : null}
          <View className="absolute bottom-0 left-0 right-0 bg-black/45 p-3">
            <Text numberOfLines={1} className="text-base font-semibold text-white">{memory.title}</Text>
            <Text numberOfLines={1} className="mt-1 text-xs text-white">{memory.scene?.name ?? memory.type.replace(/_/g, ' ')}</Text>
          </View>
        </View>
      ) : null}
      <View className="gap-3 p-4">
        <View className="flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1">
            <Text className="text-lg font-semibold text-app-text">{memory.title}</Text>
            <Text className="mt-1 text-xs uppercase tracking-normal text-app-muted">{memory.type.replace(/_/g, ' ')}</Text>
          </View>
          <Text className="text-sm font-semibold text-app-muted">{memory.date}</Text>
        </View>
        <Text className="text-sm leading-5 text-app-muted">{memory.summary}</Text>
        {memory.key_choice || memory.relationship_delta ? (
          <View className="gap-2 rounded-md bg-app-bg p-3">
            {memory.key_choice ? <Text className="text-sm text-app-text">Choice: {memory.key_choice}</Text> : null}
            {memory.relationship_delta ? <Text className="text-sm text-app-primary">{memory.relationship_delta}</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  portrait: {
    bottom: -18,
    height: '118%',
    position: 'absolute',
    right: 12,
    width: '42%',
  },
});
