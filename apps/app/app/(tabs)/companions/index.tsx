import { View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { TopBar } from '@/components/TopBar';

export default function CompanionsScreen() {
  return (
    <View className="flex-1 bg-app-bg">
      <TopBar title="Companions" />
      <EmptyState title="Companions are coming soon" description="P2 will connect /companions and show official and user-created companions." />
    </View>
  );
}
