import type { ReactNode } from 'react';
import { Image, Text, View, type ImageSourcePropType } from 'react-native';

import { cn } from './cn';

export type WebAvatarProps = {
  className?: string;
  fallback?: string;
  ring?: 'none' | 'rose' | 'wine' | 'glow';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  source?: ImageSourcePropType | null;
};

const sizeClass = {
  xs: 'h-7 w-7',
  sm: 'h-9 w-9',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  xl: 'h-24 w-24',
  '2xl': 'h-36 w-36',
};

const textSize = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl',
  '2xl': 'text-5xl',
};

const ringClass = {
  none: '',
  rose: 'ring-2 ring-rose/40 ring-offset-2 ring-offset-app-canvas',
  wine: 'ring-2 ring-wine/40 ring-offset-2 ring-offset-app-canvas',
  glow: 'shadow-[0_0_0_4px_rgba(201,72,107,0.18)]',
};

export function WebAvatar({ className, fallback, ring = 'none', size = 'md', source }: WebAvatarProps) {
  const initials = (fallback ?? '·').slice(0, 1).toUpperCase();
  return (
    <View
      className={cn(
        'items-center justify-center overflow-hidden rounded-full bg-rose-300/12',
        sizeClass[size],
        ringClass[ring],
        className,
      )}
    >
      {source ? (
        <Image accessibilityLabel={fallback} resizeMode="cover" source={source} className="h-full w-full" />
      ) : (
        <Text className={cn('font-serif font-semibold text-rose-200', textSize[size])}>{initials}</Text>
      )}
    </View>
  );
}

export function WebAvatarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn('flex-row items-center -space-x-2', className)}>{children}</View>;
}
