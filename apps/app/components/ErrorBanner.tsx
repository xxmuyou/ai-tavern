import { Pressable, Text, View } from 'react-native';

import { useErrorBanner } from '@/hooks/use-error-banner';

export function ErrorBanner() {
  const { dismissError, errors } = useErrorBanner();
  const current = errors[0];

  if (!current) {
    return null;
  }

  return (
    <View className="absolute left-0 right-0 top-0 z-50 items-center px-4 pt-4">
      <View className="w-full max-w-3xl flex-row items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
        <Text className="flex-1 text-sm font-medium text-red-800">{current.message}</Text>
        <Pressable accessibilityRole="button" onPress={() => dismissError(current.id)} className="p-1">
          <Text className="text-lg font-semibold text-red-800">×</Text>
        </Pressable>
      </View>
    </View>
  );
}
