import { View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { TopBar } from '@/components/TopBar';

export default function CompanionsScreen() {
  return (
    <View className="flex-1 bg-app-bg">
      <TopBar title="Companions" />
      <EmptyState title="角色即将开放" description="P2 会接入 /companions 并展示官方角色与自创角色。" />
    </View>
  );
}
