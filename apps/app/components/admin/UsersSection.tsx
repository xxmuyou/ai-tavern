import { Text, View } from 'react-native';

import { CreditsSection } from './CreditsSection';
import { MembersSection } from './MembersSection';

export function UsersSection() {
  return (
    <View className="gap-5">
      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-lg font-semibold text-app-text">User management</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Admin access, member lookup, and credit adjustments live in one place.
        </Text>
      </View>
      <MembersSection />
      <CreditsSection />
    </View>
  );
}
