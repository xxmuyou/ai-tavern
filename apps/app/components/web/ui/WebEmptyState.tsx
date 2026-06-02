import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { WebButton } from './WebButton';

export type WebEmptyStateProps = {
  actionLabel?: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
  title: string;
};

export function WebEmptyState({ actionLabel, description, icon = 'sparkles-outline', onAction, title }: WebEmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center rounded-2xl border border-dashed border-app-line bg-app-sunken/30 px-8 py-16">
      <View className="mb-5 h-14 w-14 items-center justify-center rounded-full bg-rose-soft">
        <Ionicons color="#9A2F4F" name={icon} size={24} />
      </View>
      <Text className="text-center font-serif text-title text-app-ink">{title}</Text>
      {description ? (
        <Text className="mt-2 max-w-md text-center text-body-sm leading-6 text-app-muted">{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View className="mt-6">
          <WebButton label={actionLabel} onPress={onAction} variant="outline" />
        </View>
      ) : null}
    </View>
  );
}
