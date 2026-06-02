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
    'border border-app-rose/35 bg-app-rose-soft shadow-card hover:border-app-rose/60 hover:bg-app-rose-soft/80 hover:shadow-float active:bg-app-rose-soft',
  secondary:
    'border border-app-brand/20 bg-app-brand-soft shadow-card hover:border-app-brand/40 hover:bg-app-brand-soft/80 active:bg-app-brand-soft',
  ghost:
    'border border-transparent bg-app-sunken/70 hover:border-app-line hover:bg-app-ember-soft/70 active:bg-app-ember-soft',
  outline:
    'border border-app-rose/30 bg-app-rose-soft/80 shadow-card hover:border-app-rose/50 hover:bg-app-rose-soft active:bg-app-rose-soft',
  danger:
    'border border-app-danger/25 bg-app-danger-soft shadow-card hover:border-app-danger/45 hover:bg-app-danger-soft/80 active:bg-app-danger-soft',
  glow: 'border border-rose/30 bg-gradient-warm hover:border-rose/50 hover:shadow-glow active:bg-rose-soft',
  brand:
    'border border-app-brand/25 bg-app-brand-soft shadow-card hover:border-app-brand/45 hover:bg-app-brand-soft/80 hover:shadow-float active:bg-app-brand-soft',
  ember:
    'border border-app-ember/25 bg-app-ember-soft shadow-card hover:border-app-ember/45 hover:bg-app-ember-soft/80 hover:shadow-float active:bg-app-ember-soft',
  google:
    'border border-app-info/25 bg-app-info-soft shadow-card hover:border-app-info/45 hover:bg-app-info-soft/80 hover:shadow-float active:bg-app-info-soft',
};

const textColorClass: Record<WebButtonVariant, string> = {
  primary: 'text-app-rose-deep',
  secondary: 'text-app-brand-deep',
  ghost: 'text-app-ink-soft',
  outline: 'text-app-rose-deep',
  danger: 'text-app-danger',
  glow: 'text-app-ink',
  brand: 'text-app-brand-deep',
  ember: 'text-app-ember',
  google: 'text-app-info',
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
        <ActivityIndicator color="#2A1F1A" />
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
