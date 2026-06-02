import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

type ButtonVariant = 'danger' | 'google' | 'primary' | 'secondary';

type ButtonProps = {
  disabled?: boolean;
  iconLeft?: ReactNode;
  isLoading?: boolean;
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
};

const variantClassName: Record<ButtonVariant, string> = {
  danger: 'border border-app-danger/25 bg-app-danger-soft',
  google: 'border border-app-info/25 bg-app-info-soft',
  primary: 'border border-app-primary/25 bg-app-primarySoft',
  secondary: 'border border-app-primary/20 bg-app-primarySoft',
};

const textClassName: Record<ButtonVariant, string> = {
  danger: 'text-app-danger',
  google: 'text-app-info',
  primary: 'text-app-primary',
  secondary: 'text-app-primary',
};

export function Button({ disabled, iconLeft, isLoading, label, onPress, variant = 'primary' }: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      className={`min-h-12 items-center justify-center rounded-lg px-4 ${variantClassName[variant]} ${
        isDisabled ? 'opacity-50' : 'opacity-100'
      }`}
    >
      {isLoading ? (
        <ActivityIndicator color="#11181C" />
      ) : (
        <View className="flex-row items-center gap-2">
          {iconLeft ? <View>{iconLeft}</View> : null}
          <Text className={`text-base font-semibold ${textClassName[variant]}`}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
