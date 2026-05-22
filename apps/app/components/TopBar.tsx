import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

type TopBarProps = {
  right?: ReactNode;
  showBack?: boolean;
  title: string;
};

export function TopBar({ right, showBack, title }: TopBarProps) {
  const router = useRouter();

  return (
    <View className="min-h-16 flex-row items-center justify-between border-b border-app-line bg-app-card px-4">
      <View className="flex-1 flex-row items-center gap-3">
        {showBack ? (
          <Pressable accessibilityRole="button" onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-lg">
            <Ionicons color="#11181C" name="chevron-back" size={24} />
          </Pressable>
        ) : null}
        <Text numberOfLines={1} className="flex-1 text-xl font-semibold text-app-text">
          {title}
        </Text>
      </View>
      {right ? <View className="ml-3">{right}</View> : null}
    </View>
  );
}
