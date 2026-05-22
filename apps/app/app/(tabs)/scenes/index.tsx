import { View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { TopBar } from '@/components/TopBar';

export default function ScenesScreen() {
  return (
    <View className="flex-1 bg-app-bg">
      <TopBar title="Scenes" />
      <EmptyState title="Scenes are coming soon" description="P2 will connect /scenes and show available urban fantasy scenes." />
    </View>
  );
}
