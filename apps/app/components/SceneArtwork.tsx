import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import { Image, Text, View } from 'react-native';

type SceneArtworkProps = {
  children?: ReactNode;
  className?: string;
  fallbackLabel?: string;
  label: string;
  source: ImageSourcePropType | null;
  style?: StyleProp<ViewStyle>;
};

export function SceneArtwork({
  children,
  className = '',
  fallbackLabel,
  label,
  source,
  style,
}: SceneArtworkProps) {
  return (
    <View
      className={`relative aspect-video w-full overflow-hidden bg-[#18111F] ${className}`}
      style={style}
    >
      {source ? (
        <Image
          accessibilityLabel={label}
          source={source}
          resizeMode="contain"
          className="h-full w-full"
        />
      ) : (
        <SceneArtworkFallback label={fallbackLabel ?? label} />
      )}
      {children}
    </View>
  );
}

export function SceneStageBackdrop({
  label,
  source,
}: {
  label: string;
  source: ImageSourcePropType | null;
}) {
  return (
    <View className="absolute inset-0 bg-[#18111F]">
      {source ? (
        <Image
          accessibilityLabel={label}
          source={source}
          resizeMode="contain"
          className="h-full w-full"
        />
      ) : (
        <View className="h-full w-full bg-[#332B3B]" />
      )}
    </View>
  );
}

function SceneArtworkFallback({ label }: { label: string }) {
  const initial = label.trim().charAt(0).toUpperCase();
  return (
    <View className="h-full w-full items-center justify-center bg-[#21142A]">
      {initial ? (
        <Text className="font-serif text-display-sm text-rose-50/35">{initial}</Text>
      ) : (
        <Ionicons color="rgba(255,255,255,0.42)" name="map-outline" size={32} />
      )}
    </View>
  );
}
