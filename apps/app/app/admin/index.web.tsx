import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';

import type { AdminSection } from '@/components/admin/AdminSectionTabs';
import { LlmSection } from '@/components/admin/LlmSection';
import { PortraitGenerationSection } from '@/components/admin/PortraitGenerationSection';
import { PromptsSection } from '@/components/admin/PromptsSection';
import { SettingsSection } from '@/components/admin/SettingsSection';
import { UsersSection } from '@/components/admin/UsersSection';
import { AdminGuard } from '@/components/AdminGuard';
import { WebAppShell } from '@/components/web/WebAppShell';
import { ADMIN_ROUTE } from '@/constants/routes';
import { WebPageContainer, WebSidebar, WebTopBar, type WebNavItem } from '@/components/web/ui';

const SECTION_ITEMS: (WebNavItem & { id: AdminSection; subtitle: string })[] = [
  { href: ADMIN_ROUTE, icon: 'people-outline', id: 'users', label: 'Users', subtitle: 'Members and credits' },
  { href: ADMIN_ROUTE, icon: 'hardware-chip-outline', id: 'chat-models', label: 'Chat models', subtitle: 'LLM routing and usage' },
  { href: ADMIN_ROUTE, icon: 'image-outline', id: 'portrait-generation', label: 'Portrait generation', subtitle: 'Image jobs and catalogs' },
  { href: ADMIN_ROUTE, icon: 'chatbubbles-outline', id: 'prompts', label: 'Prompts', subtitle: 'Generation prompt surfaces' },
  { href: ADMIN_ROUTE, icon: 'settings-outline', id: 'settings', label: 'Settings', subtitle: 'Runtime operations' },
];

export default function WebAdminScreen() {
  return (
    <AdminGuard>
      <WebAdminContent />
    </AdminGuard>
  );
}

function WebAdminContent() {
  const [section, setSection] = useState<AdminSection>('users');
  const activeItem = SECTION_ITEMS.find((item) => item.id === section) ?? SECTION_ITEMS[0];

  return (
    <WebAppShell maxWidth="full" title="Admin" subtitle="Operational controls for the current environment.">
      <View className="min-h-[calc(100vh-220px)] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-card">
        <View className="min-h-[calc(100vh-220px)] flex-row">
          <WebSidebar
            activeId={section}
            brandSubtitle="Operational controls"
            brandTitle="Admin"
            className="bg-white/[0.06]"
            items={SECTION_ITEMS}
            onItemPress={(item) => setSection((item.id ?? 'users') as AdminSection)}
            width={260}
            bottomSlot={
              <View className="gap-2 rounded-xl border border-white/10 bg-white/[0.075] p-3">
                <View className="flex-row items-center gap-2">
                  <Ionicons color="#9A2F4F" name={activeItem.icon} size={16} />
                  <Text className="text-caption font-semibold text-white">{activeItem.label}</Text>
                </View>
                <Text className="text-caption text-rose-50/60">{activeItem.subtitle}</Text>
              </View>
            }
          />
          <View className="min-w-0 flex-1 bg-[#10070d]">
            <WebTopBar
              className="rounded-none"
              subtitle={activeItem.subtitle}
              title={activeItem.label}
            />
            <WebPageContainer maxWidth="2xl" scroll={false}>
              {section === 'users' ? <UsersSection /> : null}
              {section === 'chat-models' ? <LlmSection /> : null}
              {section === 'portrait-generation' ? <PortraitGenerationSection /> : null}
              {section === 'prompts' ? <PromptsSection /> : null}
              {section === 'settings' ? <SettingsSection /> : null}
            </WebPageContainer>
          </View>
        </View>
      </View>
    </WebAppShell>
  );
}
