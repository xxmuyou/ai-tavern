import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import { formatLevel } from '@/utils/format';

type CompanionCardProps = {
  artUrl?: string | null;
  level?: string | null;
  name: string;
  onPress?: () => void;
  opener?: string;
  role?: string | null;
};

export function CompanionCard({ artUrl, level, name, onPress, opener, role }: CompanionCardProps) {
  const imageSource = mediaSource(artUrl);
  const content = (
    <>
      <View className="aspect-[3/4] w-full items-center justify-start overflow-hidden rounded-lg bg-app-primarySoft">
        {imageSource ? (
          <Image source={imageSource} resizeMode="contain" className="h-full w-full" />
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
        {opener ? <Text className="mt-2 text-sm leading-5 text-app-muted">{opener}</Text> : null}
      </View>
    </>
  );

  if (!onPress) {
    return <View className="rounded-lg border border-app-line bg-app-card p-3">{content}</View>;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="rounded-lg border border-app-line bg-app-card p-3">
      {content}
      <View className="absolute bottom-3 right-3 h-8 w-8 items-center justify-center rounded-full bg-app-primary">
        <Ionicons color="#FFFFFF" name="chevron-forward" size={16} />
      </View>
    </Pressable>
  );
}
