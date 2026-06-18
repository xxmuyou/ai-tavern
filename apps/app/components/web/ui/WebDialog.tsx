import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import { cn } from './cn';

export type WebDialogProps = {
  children?: ReactNode;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  surface?: 'default' | 'glass' | 'solid';
  title: string;
};

const sizeClass = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
};

const surfaceClass = {
  default: {
    panel: 'border-white/12 bg-app-solid-panel',
    chrome: 'border-white/12 bg-app-solid-surface',
    description: 'text-rose-50/75',
    close: 'hover:bg-app-solid-sunken',
  },
  glass: {
    panel: 'border-white/12 bg-app-solid-panel/92 backdrop-blur-md',
    chrome: 'border-white/12 bg-app-solid-surface/95',
    description: 'text-rose-50/75',
    close: 'hover:bg-app-solid-sunken',
  },
  solid: {
    panel: 'border-app-line bg-app-solid-panel',
    chrome: 'border-app-line bg-app-solid-surface',
    description: 'text-app-ink-soft',
    close: 'hover:bg-app-solid-sunken',
  },
};

export function WebDialog({
  children,
  description,
  footer,
  onClose,
  open,
  size = 'md',
  surface = 'default',
  title,
}: WebDialogProps) {
  const tone = surfaceClass[surface];
  return (
    <Modal animationType="fade" transparent visible={open} onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close dialog"
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/72 px-6"
      >
        <Pressable
          accessibilityRole="none"
          onPress={(e) => e.stopPropagation?.()}
          className={cn(
            'min-h-0 max-h-[calc(100vh-48px)] w-full overflow-hidden rounded-2xl border shadow-float',
            tone.panel,
            sizeClass[size],
          )}
        >
          <View className={cn('flex-row items-start justify-between gap-4 border-b px-7 py-5', tone.chrome)}>
            <View className="min-w-0 flex-1">
              <Text className="font-serif text-title text-white">{title}</Text>
              {description ? <Text className={cn('mt-1 text-body-sm', tone.description)}>{description}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              className={cn('h-9 w-9 items-center justify-center rounded-full', tone.close)}
            >
              <Ionicons color={PALETTE.muted} name="close" size={20} />
            </Pressable>
          </View>
          <ScrollView
            className="min-h-0"
            contentContainerClassName="px-7 py-6"
            keyboardShouldPersistTaps="handled"
            style={styles.bodyScroll}
          >
            {children}
          </ScrollView>
          {footer ? <View className={cn('border-t px-7 py-4', tone.chrome)}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bodyScroll: {
    flexShrink: 1,
  },
});
