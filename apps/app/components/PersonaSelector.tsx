import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Persona } from '@/api/types';

type PersonaSelectorProps = {
  personas: Persona[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

/**
 * Compact "who am I in this chat" switcher. Hidden when the user has no
 * personas (the chat falls back to none) and collapses to a single static
 * label when there is exactly one. With several, each is a tappable chip.
 */
export function PersonaSelector({ personas, selectedId, onSelect }: PersonaSelectorProps) {
  if (personas.length === 0) {
    return null;
  }

  const active = personas.find((p) => p.id === selectedId) ?? personas.find((p) => p.is_default) ?? personas[0];

  if (personas.length === 1) {
    return (
      <View className="flex-row items-center gap-1 border-b border-app-line bg-app-card px-4 py-1.5">
        <Text className="text-xs text-app-muted">Chatting as</Text>
        <Text className="text-xs font-semibold text-app-text">{active?.name}</Text>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-2 border-b border-app-line bg-app-card px-4 py-1.5">
      <Text className="text-xs text-app-muted">As</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {personas.map((persona) => {
            const isActive = persona.id === active?.id;
            return (
              <Pressable
                key={persona.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => onSelect(persona.id)}
                className={`rounded-full border px-3 py-1 ${
                  isActive ? 'border-app-rose/70 bg-app-canvas/70' : 'border-app-line bg-white'
                }`}
              >
                <Text className={`text-xs font-semibold ${isActive ? 'text-app-rose-deep' : 'text-app-muted'}`}>
                  {persona.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
