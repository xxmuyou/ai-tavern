import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from './cn';

export type WebTagVariant = 'brand' | 'rose' | 'wine' | 'ember' | 'neutral' | 'success' | 'warning' | 'danger';
export type WebTagSize = 'sm' | 'md';

export type WebTagProps = {
  children: ReactNode;
  className?: string;
  iconLeft?: ReactNode;
  size?: WebTagSize;
  variant?: WebTagVariant;
};

const variantClass: Record<WebTagVariant, { container: string; text: string }> = {
  brand: {
    container: 'bg-emerald-300/12',
    text: 'text-emerald-200',
  },
  rose: {
    container: 'bg-rose-300/12',
    text: 'text-rose-200',
  },
  wine: {
    container: 'bg-app-wine-soft',
    text: 'text-app-wine',
  },
  ember: {
    container: 'bg-app-ember-soft',
    text: 'text-app-ember',
  },
  neutral: {
    container: 'bg-app-sunken',
    text: 'text-rose-50/80',
  },
  success: {
    container: 'bg-app-success/15',
    text: 'text-app-success',
  },
  warning: {
    container: 'bg-app-warning-soft',
    text: 'text-app-warning',
  },
  danger: {
    container: 'bg-app-danger-soft',
    text: 'text-app-danger',
  },
};

const sizeClass: Record<WebTagSize, string> = {
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-3 py-1 text-[13px]',
};

export function WebTag({ children, className, iconLeft, size = 'md', variant = 'neutral' }: WebTagProps) {
  const tone = variantClass[variant];

  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-full',
        tone.container,
        sizeClass[size],
        className,
      )}
    >
      {iconLeft ? <View className={tone.text}>{iconLeft}</View> : null}
      {typeof children === 'string' ? (
        <Text className={cn('font-semibold', tone.text)}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
