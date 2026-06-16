import type { ReactNode } from 'react';
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import { Image, StyleSheet, Text, View } from 'react-native';

type CompanionArtworkProps = {
  children?: ReactNode;
  className?: string;
  fallback?: ReactNode;
  label: string;
  source: ImageSourcePropType | null;
  style?: StyleProp<ViewStyle>;
};

// Companion/profile/asset artwork should show the whole image inside a stable
// frame. Use cropped cover only for explicit avatar-only surfaces.
export function CompanionArtwork({
  children,
  className = '',
  fallback,
  label,
  source,
  style,
}: CompanionArtworkProps) {
  return (
    <View className={`relative items-center justify-center overflow-hidden bg-[#18111F] ${className}`} style={style}>
      {source ? (
        <Image
          accessibilityLabel={label}
          resizeMode="contain"
          source={source}
          style={styles.image}
        />
      ) : (
        fallback ?? <CompanionArtworkFallback label={label} />
      )}
      {children}
    </View>
  );
}

function CompanionArtworkFallback({ label }: { label: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <View className="h-full w-full items-center justify-center bg-[#21142A]">
      <Text className="font-serif text-display-sm text-rose-50/35">{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    height: '100%',
    width: '100%',
  },
});
