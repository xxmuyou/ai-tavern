import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from './cn';

export type WebStatProps = {
  className?: string;
  description?: string;
  eyebrow?: string;
  icon?: ReactNode;
  value: string;
};

export function WebStat({ className, description, eyebrow, icon, value }: WebStatProps) {
  return (
    <View className={cn('gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-5', className)}>
      <View className="flex-row items-center gap-2">
        {icon ? <View className="text-app-rose">{icon}</View> : null}
        {eyebrow ? (
          <Text className="text-overline text-app-rose-deep">{eyebrow}</Text>
        ) : null}
      </View>
      <Text className="font-serif text-display-sm text-white">{value}</Text>
      {description ? (
        <Text className="text-caption text-rose-50/60">{description}</Text>
      ) : null}
    </View>
  );
}
