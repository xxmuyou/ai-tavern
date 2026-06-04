import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { cn } from '@/components/web/ui';

/**
 * Shared admin dropdown: a compact pressable with a down-chevron that toggles a
 * floating option list. The list is absolutely positioned so long catalogs
 * (providers / models / setting groups) overlay instead of pushing the page,
 * and scroll past a few rows. Used across every admin section.
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
    <View className="relative z-10">
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((current) => !current)}
        className="min-h-9 flex-row items-center justify-between gap-2 rounded-lg border border-app-line bg-app-surface px-3 hover:border-rose/60"
      >
        <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-app-ink">
          {labelForValue(value)}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Ionicons color="#9A2F4F" name="chevron-down" size={14} />
        </View>
      </Pressable>
      {open ? (
        <View className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-hidden rounded-lg border border-app-line bg-app-surface shadow-card">
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map((option) => (
              <Pressable
                key={option.value ?? 'none'}
                accessibilityRole="button"
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'border-b border-app-line px-3 py-2 last:border-b-0 hover:bg-rose-soft',
                  option.value === value ? 'bg-app-sunken/60' : 'bg-app-surface',
                )}
              >
                <Text
                  className={cn('text-sm font-semibold', option.value === value ? 'text-rose-deep' : 'text-app-ink')}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
