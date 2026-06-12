import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import { cn } from './cn';

export type WebDialogProps = {
  children?: ReactNode;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  size?: 'sm' | 'md' | 'lg';
  surface?: 'default' | 'solid';
  title: string;
};

const sizeClass = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

const surfaceClass = {
  default: {
    panel: 'border-white/12 bg-[#130A18]/98',
    chrome: 'border-white/12 bg-[#1B0F22]',
    description: 'text-rose-50/75',
    close: 'hover:bg-white/[0.075]',
  },
  solid: {
    panel: 'border-app-line bg-app-surface',
    chrome: 'border-app-line bg-[#1B0F22]',
    description: 'text-app-ink-soft',
    close: 'hover:bg-app-rose-soft',
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
          className={cn('w-full overflow-hidden rounded-2xl border shadow-float', tone.panel, sizeClass[size])}
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
          <View className="px-7 py-6">{children}</View>
          {footer ? <View className={cn('border-t px-7 py-4', tone.chrome)}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
