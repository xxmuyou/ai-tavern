import { ActivityIndicator, Pressable, Text } from 'react-native';

type ButtonVariant = 'danger' | 'primary' | 'secondary';

type ButtonProps = {
  disabled?: boolean;
  isLoading?: boolean;
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
};

const variantClassName: Record<ButtonVariant, string> = {
  danger: 'bg-app-danger',
  primary: 'bg-app-primary',
  secondary: 'border border-app-line bg-app-card',
};

const textClassName: Record<ButtonVariant, string> = {
  danger: 'text-white',
  primary: 'text-white',
  secondary: 'text-app-text',
};

export function Button({ disabled, isLoading, label, onPress, variant = 'primary' }: ButtonProps) {
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
        <ActivityIndicator color={variant === 'secondary' ? '#11181C' : '#FFFFFF'} />
      ) : (
        <Text className={`text-base font-semibold ${textClassName[variant]}`}>{label}</Text>
      )}
    </Pressable>
  );
}
