import { ActivityIndicator, Text, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

type LoadingScreenProps = {
  label?: string;
};

export function LoadingScreen({ label = 'Loading...' }: LoadingScreenProps) {
  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-6">
      <ActivityIndicator color={PALETTE.rose} size="large" />
      <Text className="mt-3 text-sm text-app-muted">{label}</Text>
    </View>
  );
}
