import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { QuotaBadge } from './QuotaBadge';

type TopBarProps = {
  backFallback?: Href;
  right?: ReactNode;
  showQuota?: boolean;
  showBack?: boolean;
  title: string;
};

export function TopBar({ backFallback, right, showBack, showQuota, title }: TopBarProps) {
  const router = useRouter();
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (backFallback) {
      router.replace(backFallback);
    }
  };

  return (
    <View className="min-h-16 flex-row items-center justify-between border-b border-app-line bg-app-card px-4">
      <View className="flex-1 flex-row items-center gap-3">
        {showBack ? (
          <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={handleBack} className="h-10 w-10 items-center justify-center rounded-lg">
            <Ionicons color="#11181C" name="chevron-back" size={24} />
          </Pressable>
        ) : null}
        <Text numberOfLines={1} className="flex-1 text-xl font-semibold text-app-text">
          {title}
        </Text>
      </View>
      {showQuota || right ? (
        <View className="ml-3 flex-row items-center gap-2">
          {showQuota ? <QuotaBadge /> : null}
          {right}
        </View>
      ) : null}
    </View>
  );
}
