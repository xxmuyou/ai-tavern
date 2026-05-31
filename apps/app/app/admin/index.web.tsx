import { useState } from 'react';
import { View } from 'react-native';

import { AdminSectionTabs, type AdminSection } from '@/components/admin/AdminSectionTabs';
import { CreditsSection } from '@/components/admin/CreditsSection';
import { ExpressionPromptsSection } from '@/components/admin/ExpressionPromptsSection';
import { ImageModelsSection } from '@/components/admin/ImageModelsSection';
import { LlmSection } from '@/components/admin/LlmSection';
import { MembersSection } from '@/components/admin/MembersSection';
import { SettingsSection } from '@/components/admin/SettingsSection';
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
  const [section, setSection] = useState<AdminSection>('members');

  return (
    <WebAppShell title="Admin" subtitle="Manage admin members and operational controls.">
      <View className="mx-auto w-full max-w-4xl gap-6">
        <AdminSectionTabs active={section} onChange={setSection} />
        {section === 'members' ? <MembersSection /> : null}
        {section === 'credits' ? <CreditsSection /> : null}
        {section === 'llm' ? <LlmSection /> : null}
        {section === 'image-models' ? <ImageModelsSection /> : null}
        {section === 'expressions' ? <ExpressionPromptsSection /> : null}
        {section === 'settings' ? <SettingsSection /> : null}
      </View>
    </WebAppShell>
  );
}
