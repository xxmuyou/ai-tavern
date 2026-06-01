import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

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
        className="min-h-12 justify-center rounded-lg border border-app-line bg-white px-4"
      >
        <Text className="text-base font-semibold text-app-text">{labelForValue(value)}</Text>
      </Pressable>
      {open ? (
        <View className="mt-2 overflow-hidden rounded-lg border border-app-line bg-white">
          {options.map((option) => (
            <Pressable
              key={option.value ?? 'none'}
              accessibilityRole="button"
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`border-b border-app-line px-4 py-3 last:border-b-0 ${
                option.value === value ? 'bg-app-primarySoft' : 'bg-white'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  option.value === value ? 'text-app-primary' : 'text-app-text'
                }`}
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
