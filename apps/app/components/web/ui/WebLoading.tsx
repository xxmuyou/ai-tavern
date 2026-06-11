import { ActivityIndicator, Text, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

export type WebLoadingProps = {
  fullscreen?: boolean;
  label?: string;
};

export function WebLoading({ fullscreen = true, label = 'Loading...' }: WebLoadingProps) {
  if (fullscreen) {
    return (
      <View className="flex-1 items-center justify-center bg-app-canvas px-6">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-app-rose-soft">
          <ActivityIndicator color={PALETTE.roseDeep} size="small" />
        </View>
        {label ? <Text className="mt-3 text-caption text-rose-50/60">{label}</Text> : null}
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-3 py-3">
      <ActivityIndicator color={PALETTE.roseDeep} size="small" />
      {label ? <Text className="text-caption text-app-muted">{label}</Text> : null}
    </View>
  );
}
