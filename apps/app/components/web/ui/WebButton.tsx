import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PALETTE } from '@/constants/palette';

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
    'border border-app-rose bg-app-rose shadow-card hover:bg-[#FF6691] hover:shadow-glow active:bg-app-rose',
  secondary:
    'border border-app-brand/30 bg-app-brand-soft shadow-card hover:border-app-brand/55 hover:bg-app-brand-soft/80 active:bg-app-brand-soft',
  ghost:
    'border border-transparent bg-white/[0.04] hover:border-app-line hover:bg-white/[0.08] active:bg-white/[0.06]',
  outline:
    'border border-white/15 bg-transparent hover:border-app-rose/60 hover:bg-app-rose-soft/50 active:bg-app-rose-soft/70',
  danger:
    'border border-app-danger/30 bg-app-danger-soft shadow-card hover:border-app-danger/55 hover:bg-app-danger-soft/80 active:bg-app-danger-soft',
  glow: 'border border-app-rose/40 bg-gradient-warm hover:border-app-rose/70 hover:shadow-glow active:bg-app-rose-soft',
  brand:
    'border border-app-brand/30 bg-app-brand-soft shadow-card hover:border-app-brand/55 hover:bg-app-brand-soft/80 hover:shadow-glow-soft active:bg-app-brand-soft',
  ember:
    'border border-app-ember/30 bg-app-ember-soft shadow-card hover:border-app-ember/55 hover:bg-app-ember-soft/80 hover:shadow-float active:bg-app-ember-soft',
  google:
    'border border-white/80 bg-white shadow-card hover:bg-white/90 hover:shadow-float active:bg-white',
};

const textColorClass: Record<WebButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-app-brand-deep',
  ghost: 'text-app-ink-soft',
  outline: 'text-app-ink',
  danger: 'text-app-danger',
  glow: 'text-app-rose-deep',
  brand: 'text-app-brand-deep',
  ember: 'text-app-ember',
  google: 'text-[#1F1F1F]',
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
        <ActivityIndicator color={PALETTE.ink} />
      ) : (
        <View className="min-w-0 max-w-full flex-row items-center gap-2">
          {iconLeft ? <View>{iconLeft}</View> : null}
          {label ? (
            <Text
              className={cn('min-w-0 font-semibold', textSizeClass[size], textColorClass[variant])}
              numberOfLines={1}
              style={styles.label}
            >
              {label}
            </Text>
          ) : null}
          {children}
          {iconRight ? <View>{iconRight}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    flexShrink: 1,
    maxWidth: '100%',
  },
});
