import { View } from 'react-native';

import { TodayHub } from '@/components/TodayHub';
import { TopBar } from '@/components/TopBar';

export default function TabsIndex() {
  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showQuota title="Today" />
      <TodayHub />
    </View>
  );
}
