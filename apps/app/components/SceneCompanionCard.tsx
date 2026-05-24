import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';

type SceneCompanionCardProps = {
  artUrl?: string | null;
  name: string;
  onPress: () => void;
  opener?: string;
};

export function SceneCompanionCard({ artUrl, name, onPress, opener }: SceneCompanionCardProps) {
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
        {opener ? <Text numberOfLines={3} className="mt-2 text-sm leading-5 text-app-muted">{opener}</Text> : null}
      </View>

      <View className="absolute bottom-3 right-3 h-8 w-8 items-center justify-center rounded-full bg-app-primary">
        <Ionicons color="#FFFFFF" name="chevron-forward" size={16} />
      </View>
    </Pressable>
  );
}
