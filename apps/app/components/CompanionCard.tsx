import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import { formatLevel } from '@/utils/format';

type CompanionCardProps = {
  artUrl?: string | null;
  level?: string | null;
  name: string;
  onPress?: () => void;
  opener?: string;
  role?: string | null;
  tags?: string[];
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
};

export function CompanionCard({
  artUrl,
  level,
  name,
  onPress,
  opener,
  role,
  tags,
  isFavorite,
  onToggleFavorite,
}: CompanionCardProps) {
  const imageSource = mediaSource(artUrl);
  const content = (
    <>
      <View
        className="aspect-[4/5] w-full items-center justify-end overflow-hidden rounded-lg border border-app-line bg-app-primarySoft"
        style={styles.portraitFrame}
      >
        <View pointerEvents="none" style={styles.portraitFloor} />
        {imageSource ? (
          <Image
            accessibilityLabel={name}
            resizeMode="contain"
            source={imageSource}
            style={styles.portraitImage}
          />
        ) : (
          <View className="h-full w-full items-center justify-center bg-app-primarySoft">
            <Text className="text-4xl font-semibold text-app-primary">{name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View className="mt-3 gap-1">
        <View className="flex-row items-start justify-between gap-2">
          <Text numberOfLines={2} className="flex-1 text-base font-semibold text-app-text">
            {name}
          </Text>
          <View className="rounded-full bg-app-card px-2 py-1">
            <Text className="text-xs font-semibold text-app-primary">{formatLevel(level)}</Text>
          </View>
        </View>
        {role ? <Text className="text-xs uppercase tracking-normal text-app-muted">{role}</Text> : null}
        {tags && tags.length > 0 ? (
          <View className="mt-1 flex-row flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <View key={tag} className="rounded-full bg-app-primarySoft px-2 py-0.5">
                <Text className="text-[10px] font-semibold text-app-primary">{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {opener ? <Text className="mt-2 text-sm leading-5 text-app-muted">{opener}</Text> : null}
      </View>
    </>
  );

  const favoriteButton = onToggleFavorite ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      onPress={onToggleFavorite}
      hitSlop={8}
      className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full bg-app-card/90"
    >
      <Ionicons color={isFavorite ? '#E0245E' : '#687076'} name={isFavorite ? 'heart' : 'heart-outline'} size={18} />
    </Pressable>
  ) : null;

  if (!onPress) {
    return (
      <View className="rounded-lg border border-app-line bg-app-card p-3">
        {content}
        {favoriteButton}
      </View>
    );
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="rounded-lg border border-app-line bg-app-card p-3">
      {content}
      {favoriteButton}
      <View className="absolute bottom-3 right-3 h-8 w-8 items-center justify-center rounded-full bg-app-primary">
        <Ionicons color="#FFFFFF" name="chevron-forward" size={16} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  portraitFloor: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    bottom: 0,
    height: 58,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  portraitFrame: {
    backgroundColor: '#EEF1F4',
  },
  portraitImage: {
    height: '108%',
    transform: [{ translateY: 10 }],
    width: '108%',
  },
});
