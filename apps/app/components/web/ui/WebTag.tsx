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
  brand: 'bg-emerald-300/12 text-emerald-200',
  rose: 'bg-rose-300/12 text-rose-200',
  wine: 'bg-app-wine-soft text-app-wine',
  ember: 'bg-orange-300/12 text-orange-200',
  neutral: 'bg-white/[0.075] text-rose-50/75',
  success: 'bg-app-success/15 text-emerald-200',
  warning: 'bg-amber-300/12 text-amber-200',
  danger: 'bg-rose-500/12 text-rose-200',
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
