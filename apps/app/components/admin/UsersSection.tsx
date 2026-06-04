import { View } from 'react-native';

import { AdminPanel, AdminPanelHeader } from './AdminPanel';
import { CreditsSection } from './CreditsSection';
import { MembersSection } from './MembersSection';

export function UsersSection() {
  return (
    <View className="gap-3">
      <AdminPanel>
        <AdminPanelHeader
          subtitle="Admin access, member lookup, and credit adjustments live in one place."
          title="User management"
        />
      </AdminPanel>
      <MembersSection />
      <CreditsSection />
    </View>
  );
}
