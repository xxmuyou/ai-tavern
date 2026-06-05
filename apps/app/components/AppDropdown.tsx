import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { cn } from '@/components/web/ui';

type Anchor = { x: number; y: number; width: number; height: number };

const MENU_MAX_HEIGHT = 256;
const GAP = 4;

export function AppDropdown<T extends string | null>({
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
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<View>(null);

  const openMenu = () => {
    const node = triggerRef.current;
    if (!node) {
      setOpen(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ height, width, x, y });
      setOpen(true);
    });
  };

  const screenHeight = Dimensions.get('window').height;
  const menuStyle = (() => {
    if (!anchor) return { left: 0, top: 0, width: 240 };
    const below = screenHeight - (anchor.y + anchor.height);
    const flipUp = below < MENU_MAX_HEIGHT + GAP && anchor.y > below;
    return {
      left: anchor.x,
      maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, (flipUp ? anchor.y : below) - GAP)),
      width: anchor.width,
      ...(flipUp ? { bottom: screenHeight - anchor.y + GAP } : { top: anchor.y + anchor.height + GAP }),
    };
  })();

  return (
    <View ref={triggerRef} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        onPress={openMenu}
        className="min-h-9 flex-row items-center justify-between gap-2 rounded-lg border border-app-line bg-app-surface px-3 hover:border-rose/60"
      >
        <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-app-ink">
          {labelForValue(value)}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Ionicons color="#9A2F4F" name="chevron-down" size={14} />
        </View>
      </Pressable>

      <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={() => setOpen(false)}
          style={{ flex: 1 }}
        >
          <View className="absolute overflow-hidden rounded-lg border border-app-line bg-app-surface shadow-float" style={menuStyle}>
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
                  <Text className={cn('text-sm font-semibold', option.value === value ? 'text-rose-deep' : 'text-app-ink')}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
