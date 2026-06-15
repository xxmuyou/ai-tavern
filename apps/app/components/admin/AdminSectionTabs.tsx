import { Pressable, ScrollView, Text } from 'react-native';

export type AdminSection =
  | 'analytics'
  | 'users'
  | 'chat-models'
  | 'portrait-generation'
  | 'prompts'
  | 'settings';

const TABS: { id: AdminSection; label: string }[] = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'users', label: 'Users' },
  { id: 'chat-models', label: 'Chat models' },
  { id: 'portrait-generation', label: 'Portrait generation' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'settings', label: 'Settings' },
];

export function AdminSectionTabs({
  active,
  onChange,
  sections,
}: {
  active: AdminSection;
  onChange: (section: AdminSection) => void;
  sections?: AdminSection[];
}) {
  const tabs = sections ? TABS.filter((tab) => sections.includes(tab.id)) : TABS;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="button"
            onPress={() => onChange(tab.id)}
            className={`rounded-full border px-4 py-2 ${
              isActive ? 'border-app-rose/70 bg-app-canvas/70' : 'border-app-line bg-app-canvas/70 hover:bg-app-brand-soft/70'
            }`}
          >
            <Text className={`text-sm font-semibold ${isActive ? 'text-rose-deep' : 'text-app-muted'}`}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
