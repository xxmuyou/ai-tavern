import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import { Image, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_IMAGE_ASPECT_RATIO, useImageAspectRatio } from '@/hooks/use-image-aspect-ratio';

const imageStyles = StyleSheet.create({
  fill: { height: '100%', width: '100%' },
});

const THUMB_MAX_WIDTH = 160;

type SceneArtworkProps = {
  children?: ReactNode;
  className?: string;
  fallbackAspectRatio?: number;
  fallbackLabel?: string;
  /** Thumbnail mode: fixed height, width follows the image ratio. */
  fixedHeight?: number;
  label: string;
  source: ImageSourcePropType | null;
  style?: StyleProp<ViewStyle>;
};

export function SceneArtwork({
  children,
  className = '',
  fallbackAspectRatio = DEFAULT_IMAGE_ASPECT_RATIO,
  fallbackLabel,
  fixedHeight,
  label,
  source,
  style,
}: SceneArtworkProps) {
  const { ratio } = useImageAspectRatio(source, fallbackAspectRatio);
  // The container hugs the artwork's real ratio, so contain never letterboxes
  // or crops regardless of how the image was generated.
  const sizing: StyleProp<ViewStyle> =
    fixedHeight != null
      ? { height: fixedHeight, width: Math.min(Math.round(fixedHeight * ratio), THUMB_MAX_WIDTH) }
      : { aspectRatio: ratio, width: '100%' };

  return (
    <View
      className={`relative overflow-hidden bg-[#18111F] ${className}`}
      style={[sizing, style]}
    >
      {source ? (
        <Image
          accessibilityLabel={label}
          source={source}
          resizeMode="contain"
          // Size via style, not className: react-native-web writes the image's
          // intrinsic dimensions as inline styles, which override CSS classes.
          style={imageStyles.fill}
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
          style={imageStyles.fill}
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
