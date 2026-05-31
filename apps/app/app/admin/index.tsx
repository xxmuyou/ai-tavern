import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AdminSectionTabs, type AdminSection } from '@/components/admin/AdminSectionTabs';
import { CreditsSection } from '@/components/admin/CreditsSection';
import { LlmSection } from '@/components/admin/LlmSection';
import { MembersSection } from '@/components/admin/MembersSection';
import { AdminGuard } from '@/components/AdminGuard';
import { TopBar } from '@/components/TopBar';

export default function AdminScreen() {
  const [section, setSection] = useState<AdminSection>('members');

  return (
    <AdminGuard>
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title="Admin" />
        <ScrollView className="flex-1">
          <View className="mx-auto w-full max-w-3xl gap-4 px-4 py-6">
            <AdminSectionTabs active={section} onChange={setSection} sections={['members', 'credits', 'llm']} />
            {section === 'members' ? <MembersSection /> : null}
            {section === 'credits' ? <CreditsSection /> : null}
            {section === 'llm' ? <LlmSection /> : null}
          </View>
        </ScrollView>
      </View>
    </AdminGuard>
  );
}
