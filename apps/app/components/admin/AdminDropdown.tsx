import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '@/components/web/ui';

/**
 * Shared admin dropdown: a pressable that toggles a list of options below it.
 * Replaces the near-identical local dropdowns previously inlined in
 * LlmSection / PortraitGenerationSection / PromptsSection.
 */
export function AdminDropdown<T extends string | null>({
  labelForValue,
  onChange,
  options,
  value,
}: {
  labelForValue: (value: T) => string;
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((current) => !current)}
        className="min-h-12 justify-center rounded-xl border border-app-line bg-app-surface px-4 shadow-card"
      >
        <Text className="text-body font-semibold text-app-ink">{labelForValue(value)}</Text>
      </Pressable>
      {open ? (
        <View className="mt-2 overflow-hidden rounded-xl border border-app-line bg-app-surface shadow-card">
          {options.map((option) => (
            <Pressable
              key={option.value ?? 'none'}
              accessibilityRole="button"
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                'border-b border-app-line px-4 py-3 last:border-b-0 hover:bg-rose-soft',
                option.value === value ? 'bg-app-sunken/60' : 'bg-app-surface',
              )}
            >
              <Text
                className={cn('text-body-sm font-semibold', option.value === value ? 'text-rose-deep' : 'text-app-ink')}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
