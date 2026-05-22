import { Text, View } from 'react-native';

import { Button } from './Button';

type EmptyStateProps = {
  actionLabel?: string;
  description?: string;
  onAction?: () => void;
  title: string;
};

export function EmptyState({ actionLabel, description, onAction, title }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <View className="h-12 w-12 items-center justify-center rounded-lg bg-app-primarySoft">
        <Text className="text-xl text-app-primary">·</Text>
      </View>
      <Text className="mt-4 text-center text-xl font-semibold text-app-text">{title}</Text>
      {description ? <Text className="mt-2 text-center text-sm leading-5 text-app-muted">{description}</Text> : null}
      {actionLabel && onAction ? (
        <View className="mt-6 w-full max-w-72">
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
