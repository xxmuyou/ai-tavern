import { View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { TopBar } from '@/components/TopBar';

export default function ScenesScreen() {
  return (
    <View className="flex-1 bg-app-bg">
      <TopBar title="Scenes" />
      <EmptyState title="场景即将开放" description="P2 会接入 /scenes 并展示可进入的都市奇幻场景。" />
    </View>
  );
}
