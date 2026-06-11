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
  title: string;
};

const sizeClass = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function WebDialog({ children, description, footer, onClose, open, size = 'md', title }: WebDialogProps) {
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
          className={cn('w-full overflow-hidden rounded-2xl border border-white/12 bg-[#130A18]/98 shadow-float', sizeClass[size])}
        >
          <View className="flex-row items-start justify-between gap-4 border-b border-white/12 bg-[#1B0F22] px-7 py-5">
            <View className="min-w-0 flex-1">
              <Text className="font-serif text-title text-white">{title}</Text>
              {description ? <Text className="mt-1 text-body-sm text-rose-50/75">{description}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full hover:bg-white/[0.075]"
            >
              <Ionicons color={PALETTE.muted} name="close" size={20} />
            </Pressable>
          </View>
          <View className="px-7 py-6">{children}</View>
          {footer ? <View className="border-t border-white/12 bg-[#1B0F22] px-7 py-4">{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
