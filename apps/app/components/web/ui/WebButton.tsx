import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { cn } from './cn';

export type WebButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'glow' | 'brand' | 'ember' | 'google';
export type WebButtonSize = 'sm' | 'md' | 'lg';

export type WebButtonProps = {
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  isLoading?: boolean;
  label?: string;
  onPress?: () => void;
  size?: WebButtonSize;
  variant?: WebButtonVariant;
};

const baseClass =
  'flex-row items-center justify-center gap-2 rounded-xl transition-colors duration-150 ease-editorial active:scale-[0.98]';

const sizeClass: Record<WebButtonSize, string> = {
  sm: 'min-h-9 px-3',
  md: 'min-h-11 px-5',
  lg: 'min-h-13 px-7',
};

const textSizeClass: Record<WebButtonSize, string> = {
  sm: 'text-sm',
  md: 'text-[15px]',
  lg: 'text-base',
};

const variantClass: Record<WebButtonVariant, string> = {
  primary:
    'border border-app-rose/35 bg-rose-300/12 shadow-card hover:border-app-rose/60 hover:bg-rose-300/16 hover:shadow-float active:bg-rose-300/12',
  secondary:
    'border border-app-brand/20 bg-emerald-300/12 shadow-card hover:border-app-brand/40 hover:bg-emerald-300/16 active:bg-emerald-300/12',
  ghost:
    'border border-transparent bg-white/[0.09] hover:border-white/10 hover:bg-orange-300/14 active:bg-orange-300/12',
  outline:
    'border border-app-rose/30 bg-rose-300/16 shadow-card hover:border-app-rose/50 hover:bg-rose-300/12 active:bg-rose-300/12',
  danger:
    'border border-app-danger/25 bg-rose-500/12 shadow-card hover:border-app-danger/45 hover:bg-rose-500/16 active:bg-rose-500/12',
  glow: 'border border-rose/30 bg-rose-400/20 hover:border-rose/50 hover:bg-rose-400/26 hover:shadow-glow active:bg-rose-400/18',
  brand:
    'border border-app-brand/25 bg-emerald-300/12 shadow-card hover:border-app-brand/45 hover:bg-emerald-300/16 hover:shadow-float active:bg-emerald-300/12',
  ember:
    'border border-app-ember/25 bg-orange-300/12 shadow-card hover:border-app-ember/45 hover:bg-orange-300/16 hover:shadow-float active:bg-orange-300/12',
  google:
    'border border-app-info/25 bg-sky-300/12 shadow-card hover:border-app-info/45 hover:bg-sky-300/16 hover:shadow-float active:bg-sky-300/12',
};

const textColorClass: Record<WebButtonVariant, string> = {
  primary: 'text-rose-200',
  secondary: 'text-emerald-200',
  ghost: 'text-rose-50/75',
  outline: 'text-rose-200',
  danger: 'text-rose-300',
  glow: 'text-white',
  brand: 'text-emerald-200',
  ember: 'text-orange-200',
  google: 'text-sky-200',
};

export function WebButton({
  children,
  className,
  disabled,
  iconLeft,
  iconRight,
  isLoading,
  label,
  onPress,
  size = 'md',
  variant = 'primary',
}: WebButtonProps) {
  const isDisabled = disabled || isLoading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      className={cn(
        baseClass,
        sizeClass[size],
        variantClass[variant],
        isDisabled && 'opacity-50',
        className,
      )}
    >
      {isLoading ? (
        <ActivityIndicator color="#fff7fb" />
      ) : (
        <View className="flex-row items-center gap-2">
          {iconLeft ? <View>{iconLeft}</View> : null}
          {label ? (
            <Text className={cn('font-semibold', textSizeClass[size], textColorClass[variant])}>{label}</Text>
          ) : null}
          {children}
          {iconRight ? <View>{iconRight}</View> : null}
        </View>
      )}
    </Pressable>
  );
}
