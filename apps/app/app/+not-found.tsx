import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { SCENES_ROUTE } from '@/constants/routes';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-6">
      <Text className="text-2xl font-semibold text-app-text">Page not found</Text>
      <Text className="mt-2 text-center text-sm text-app-muted">This page is not available. Return to Scenes to continue.</Text>
      <View className="mt-6 w-full max-w-72">
        <Button label="Back to Scenes" onPress={() => router.replace(SCENES_ROUTE)} />
      </View>
    </View>
  );
}
