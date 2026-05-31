import { Pressable, ScrollView, Text } from 'react-native';

export type AdminSection =
  | 'members'
  | 'credits'
  | 'llm'
  | 'image-models'
  | 'expressions'
  | 'settings';

const TABS: { id: AdminSection; label: string }[] = [
  { id: 'members', label: 'Members' },
  { id: 'credits', label: 'Credits' },
  { id: 'llm', label: 'LLM' },
  { id: 'image-models', label: 'Image models' },
  { id: 'expressions', label: 'Expressions' },
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
              isActive ? 'border-app-primary bg-app-primary' : 'border-app-line bg-white'
            }`}
          >
            <Text className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-app-muted'}`}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
