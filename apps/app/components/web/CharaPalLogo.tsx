import { Image, Text, View, type ImageSourcePropType } from 'react-native';

import { BRAND_NAME } from '@/constants/brand';

import { cn } from './ui/cn';

const CHARAPAL_LOGO_MARK = require('../../assets/brand/charapal-logo-selected.png') as ImageSourcePropType;

type CharaPalLogoProps = {
  className?: string;
  markSize?: number;
  showText?: boolean;
  subtitle?: string;
};

export function CharaPalLogo({
  className,
  markSize = 36,
  showText = true,
  subtitle,
}: CharaPalLogoProps) {
  return (
    <View className={cn('min-w-0 flex-row items-center gap-2.5', className)}>
      <Image
        resizeMode="cover"
        source={CHARAPAL_LOGO_MARK}
        style={{ borderRadius: markSize * 0.24, height: markSize, width: markSize }}
      />
      {showText ? (
        <View className="min-w-0">
          <Text className="font-serif text-title-sm font-semibold text-white" numberOfLines={1}>
            {BRAND_NAME}
          </Text>
          {subtitle ? (
            <Text className="mt-0.5 text-caption text-rose-50/60" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
