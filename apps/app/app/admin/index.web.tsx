import { useState } from 'react';
import { View } from 'react-native';

import { AdminSectionTabs, type AdminSection } from '@/components/admin/AdminSectionTabs';
import { LlmSection } from '@/components/admin/LlmSection';
import { PortraitGenerationSection } from '@/components/admin/PortraitGenerationSection';
import { PromptsSection } from '@/components/admin/PromptsSection';
import { SettingsSection } from '@/components/admin/SettingsSection';
import { UsersSection } from '@/components/admin/UsersSection';
import { AdminGuard } from '@/components/AdminGuard';
import { WebAppShell } from '@/components/web/WebAppShell';

export default function WebAdminScreen() {
  return (
    <AdminGuard>
      <WebAdminContent />
    </AdminGuard>
  );
}

function WebAdminContent() {
  const [section, setSection] = useState<AdminSection>('users');

  return (
    <WebAppShell title="Admin" subtitle="Manage admin members and operational controls.">
      <View className="mx-auto w-full max-w-4xl gap-6">
        <AdminSectionTabs active={section} onChange={setSection} />
        {section === 'users' ? <UsersSection /> : null}
        {section === 'chat-models' ? <LlmSection /> : null}
        {section === 'portrait-generation' ? <PortraitGenerationSection /> : null}
        {section === 'prompts' ? <PromptsSection /> : null}
        {section === 'settings' ? <SettingsSection /> : null}
      </View>
    </WebAppShell>
  );
}
