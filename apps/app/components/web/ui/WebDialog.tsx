import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

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
        className="flex-1 items-center justify-center bg-app-twilight/55 px-6"
      >
        <Pressable
          accessibilityRole="none"
          onPress={(e) => e.stopPropagation?.()}
          className={cn('w-full overflow-hidden rounded-2xl bg-app-surface shadow-float', sizeClass[size])}
        >
          <View className="flex-row items-start justify-between gap-4 border-b border-app-line-soft px-7 py-5">
            <View className="min-w-0 flex-1">
              <Text className="font-serif text-title text-app-ink">{title}</Text>
              {description ? <Text className="mt-1 text-body-sm text-app-muted">{description}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full hover:bg-app-sunken"
            >
              <Ionicons color="#7A6A5E" name="close" size={20} />
            </Pressable>
          </View>
          <View className="px-7 py-6">{children}</View>
          {footer ? <View className="border-t border-app-line-soft bg-app-sunken/40 px-7 py-4">{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
