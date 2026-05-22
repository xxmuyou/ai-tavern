import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-6">
      <Text className="text-2xl font-semibold text-app-text">页面不存在</Text>
      <Text className="mt-2 text-center text-sm text-app-muted">这个入口暂时不可用，返回场景页继续。</Text>
      <View className="mt-6 w-full max-w-72">
        <Button label="返回场景" onPress={() => router.replace('/(tabs)/scenes')} />
      </View>
    </View>
  );
}
