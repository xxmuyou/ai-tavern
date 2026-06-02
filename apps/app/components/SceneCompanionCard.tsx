import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { StoryBeat } from '@/api/types';

type SceneCompanionCardProps = {
  artUrl?: string | null;
  name: string;
  onPress: () => void;
  opener?: string;
  storyBeat?: StoryBeat | null;
};

export function SceneCompanionCard({ artUrl, name, onPress, opener, storyBeat }: SceneCompanionCardProps) {
  const imageSource = mediaSource(artUrl);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="rounded-lg border border-app-line bg-app-card p-3">
      <View
        className="w-full items-center justify-end overflow-hidden rounded-lg border border-app-line"
        style={{ backgroundColor: '#EEF1F4', height: 252 }}
      >
        <View
          pointerEvents="none"
          style={{
            backgroundColor: 'rgba(255,255,255,0.42)',
            bottom: 0,
            height: 72,
            left: 0,
            position: 'absolute',
            right: 0,
          }}
        />
        {imageSource ? (
          <Image
            accessibilityLabel={name}
            resizeMode="contain"
            source={imageSource}
            style={{ height: '100%', width: '100%' }}
          />
        ) : (
          <View className="h-full w-full items-center justify-center bg-app-primarySoft">
            <Text className="text-4xl font-semibold text-app-primary">{name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
      </View>

      <View className="mt-3 gap-1 pr-8">
        <Text numberOfLines={2} className="text-base font-semibold text-app-text">
          {name}
        </Text>
        {storyBeat ? (
          <View className="mt-2 self-start rounded-full bg-app-primarySoft px-2.5 py-1">
            <Text numberOfLines={1} className="text-xs font-semibold text-app-primary">
              {storyBeat.status === 'waiting_stage' ? `Reach ${prettyStage(storyBeat.stage_gate)}` : storyBeat.title}
            </Text>
          </View>
        ) : null}
        {opener ? <Text numberOfLines={3} className="mt-2 text-sm leading-5 text-app-muted">{opener}</Text> : null}
        {storyBeat?.objective ? (
          <Text numberOfLines={2} className="mt-1 text-xs leading-4 text-app-muted">
            {storyBeat.objective}
          </Text>
        ) : null}
      </View>

      <View className="absolute bottom-3 right-3 h-8 w-8 items-center justify-center rounded-full bg-app-primary">
        <Ionicons color="#FFFFFF" name="chevron-forward" size={16} />
      </View>
    </Pressable>
  );
}

function prettyStage(stage: string): string {
  return stage
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
