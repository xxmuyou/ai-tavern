import { Text, View } from 'react-native';

import { WebCard } from '@/components/web/ui';

import { CreditsSection } from './CreditsSection';
import { MembersSection } from './MembersSection';

export function UsersSection() {
  return (
    <View className="gap-5">
      <WebCard padding="md">
        <Text className="font-serif text-title text-app-ink">User management</Text>
        <Text className="mt-1 text-body-sm leading-6 text-app-muted">
          Admin access, member lookup, and credit adjustments live in one place.
        </Text>
      </WebCard>
      <MembersSection />
      <CreditsSection />
    </View>
  );
}
