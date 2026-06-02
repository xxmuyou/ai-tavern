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

const variantClass: Record<WebTagVariant, string> = {
  brand: 'bg-app-brand-soft text-app-brand-deep',
  rose: 'bg-app-rose-soft text-app-rose-deep',
  wine: 'bg-app-wine-soft text-app-wine',
  ember: 'bg-app-ember-soft text-app-ember',
  neutral: 'bg-app-sunken text-app-ink-soft',
  success: 'bg-app-success/15 text-app-success',
  warning: 'bg-app-warning-soft text-app-warning',
  danger: 'bg-app-danger-soft text-rose-deep',
};

const sizeClass: Record<WebTagSize, string> = {
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-3 py-1 text-[13px]',
};

export function WebTag({ children, className, iconLeft, size = 'md', variant = 'neutral' }: WebTagProps) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-full',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
    >
      {iconLeft ? <View>{iconLeft}</View> : null}
      {typeof children === 'string' ? (
        <Text className="font-semibold">{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
