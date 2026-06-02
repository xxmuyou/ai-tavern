import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from './cn';

export type WebTooltipProps = {
  children: ReactNode;
  className?: string;
  content: string;
  side?: 'top' | 'bottom';
};

export function WebTooltip({ children, className, content, side = 'top' }: WebTooltipProps) {
  return (
    <View className={cn('group relative', className)}>
      {children}
      <View
        className={cn(
          'pointer-events-none absolute left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-app-twilight px-2.5 py-1.5 text-caption font-semibold text-white shadow-float group-hover:group-enabled:flex',
          side === 'top' ? '-top-9' : 'top-full mt-2',
        )}
      >
        <Text className="text-caption font-semibold text-white">{content}</Text>
        <View
          className={cn(
            'absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-app-twilight',
            side === 'top' ? '-bottom-1' : '-top-1',
          )}
        />
      </View>
    </View>
  );
}
