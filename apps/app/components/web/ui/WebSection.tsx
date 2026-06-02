import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from './cn';

export type WebSectionProps = {
  actionLabel?: string;
  children: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  onAction?: () => void;
  title: string;
};

export function WebSection({ actionLabel, children, className, description, eyebrow, onAction, title }: WebSectionProps) {
  return (
    <View className={cn('gap-5', className)}>
      <View className="flex-row items-end justify-between gap-4">
        <View className="min-w-0 flex-1">
          {eyebrow ? (
            <Text className="text-overline text-rose-deep">{eyebrow}</Text>
          ) : null}
          <Text className="font-serif text-title text-app-ink">{title}</Text>
          {description ? (
            <Text className="mt-1.5 max-w-2xl text-body-sm leading-6 text-app-muted">{description}</Text>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="link"
            onPress={onAction}
            className="flex-row items-center gap-1 self-end rounded-full px-3 py-1.5 hover:bg-rose-soft"
          >
            <Text className="text-body-sm font-semibold text-rose-deep">{actionLabel}</Text>
            <Ionicons color="#9A2F4F" name="arrow-forward" size={14} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
