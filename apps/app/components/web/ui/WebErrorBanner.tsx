import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import { useErrorBanner } from '@/hooks/use-error-banner';

import { cn } from './cn';

export function WebErrorBanner() {
  const { dismissError, errors } = useErrorBanner();
  const current = errors[0];
  if (!current) return null;

  return (
    <View className="pointer-events-none absolute left-0 right-0 top-0 z-50 items-center px-4 pt-4">
      <View className="pointer-events-auto flex w-full max-w-2xl flex-row items-center gap-3 rounded-xl border border-app-danger/40 bg-app-danger-soft px-4 py-3 shadow-card">
        <Ionicons color={PALETTE.danger} name="alert-circle-outline" size={18} />
        <Text className="flex-1 text-body-sm font-medium text-app-rose-deep">{current.message}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={() => dismissError(current.id)}
          className={cn(
            'h-7 w-7 items-center justify-center rounded-full',
          )}
        >
          <Ionicons color={PALETTE.danger} name="close" size={16} />
        </Pressable>
      </View>
    </View>
  );
}
