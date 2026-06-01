import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AdminSectionTabs, type AdminSection } from '@/components/admin/AdminSectionTabs';
import { LlmSection } from '@/components/admin/LlmSection';
import { UsersSection } from '@/components/admin/UsersSection';
import { AdminGuard } from '@/components/AdminGuard';
import { TopBar } from '@/components/TopBar';

export default function AdminScreen() {
  const [section, setSection] = useState<AdminSection>('users');

  return (
    <AdminGuard>
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title="Admin" />
        <ScrollView className="flex-1">
          <View className="mx-auto w-full max-w-3xl gap-4 px-4 py-6">
            <AdminSectionTabs active={section} onChange={setSection} sections={['users', 'chat-models']} />
            {section === 'users' ? <UsersSection /> : null}
            {section === 'chat-models' ? <LlmSection /> : null}
          </View>
        </ScrollView>
      </View>
    </AdminGuard>
  );
}
