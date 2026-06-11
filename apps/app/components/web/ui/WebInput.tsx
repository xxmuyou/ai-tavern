import type { ReactNode } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { PALETTE } from '@/constants/palette';

import { cn } from './cn';

export type WebInputProps = {
  className?: string;
  error?: string | null;
  helperText?: string;
  inputClassName?: string;
  label?: string;
  leftAdornment?: ReactNode;
  rightAdornment?: ReactNode;
} & Omit<TextInputProps, 'style'>;

const baseFieldClass =
  'flex-row items-center gap-2 rounded-xl border border-app-line bg-app-sunken px-4 transition-shadow duration-150 focus-within:border-app-rose focus-within:shadow-glow-soft';

const errorFieldClass = 'border-app-danger focus-within:border-app-danger focus-within:shadow-none';

export function WebInput({ className, error, helperText, inputClassName, label, leftAdornment, rightAdornment, ...rest }: WebInputProps) {
  return (
    <View className={cn('gap-1.5', className)}>
      {label ? <Text className="text-caption font-semibold text-rose-50/75">{label}</Text> : null}
      <View className={cn(baseFieldClass, error ? errorFieldClass : null, 'min-h-12')}>
        {leftAdornment ? <View>{leftAdornment}</View> : null}
        <TextInput
          {...rest}
          placeholderTextColor={rest.placeholderTextColor ?? PALETTE.muted}
          className={cn('flex-1 py-3 text-body text-app-ink', inputClassName)}
        />
        {rightAdornment ? <View>{rightAdornment}</View> : null}
      </View>
      {error ? (
        <Text className="text-caption text-app-danger">{error}</Text>
      ) : helperText ? (
        <Text className="text-caption text-rose-50/60">{helperText}</Text>
      ) : null}
    </View>
  );
}

type WebTextareaProps = {
  className?: string;
  error?: string | null;
  helperText?: string;
  inputClassName?: string;
  label?: string;
} & Omit<TextInputProps, 'multiline' | 'style' | 'numberOfLines'>;

export function WebTextarea({ className, error, helperText, inputClassName, label, ...rest }: WebTextareaProps) {
  return (
    <View className={cn('gap-1.5', className)}>
      {label ? <Text className="text-caption font-semibold text-rose-50/75">{label}</Text> : null}
      <TextInput
        {...rest}
        multiline
        textAlignVertical="top"
        placeholderTextColor={rest.placeholderTextColor ?? PALETTE.muted}
        className={cn(
          'min-h-28 rounded-xl border border-app-line bg-app-sunken p-4 text-body text-app-ink',
          error ? 'border-app-danger' : null,
          inputClassName,
        )}
      />
      {error ? (
        <Text className="text-caption text-app-danger">{error}</Text>
      ) : helperText ? (
        <Text className="text-caption text-rose-50/60">{helperText}</Text>
      ) : null}
    </View>
  );
}
