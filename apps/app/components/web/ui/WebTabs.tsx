import { Pressable, Text, View } from 'react-native';

import { cn } from './cn';

type Tab = { id: string; label: string };

export type WebTabsProps = {
  active: string;
  className?: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
  tabs: Tab[];
  variant?: 'pill' | 'underline';
};

export function WebTabs({ active, className, onChange, size = 'md', tabs, variant = 'pill' }: WebTabsProps) {
  if (variant === 'underline') {
    return (
      <View className={cn('flex-row items-center gap-6 border-b border-app-line', className)}>
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => onChange(tab.id)}
              className={cn('relative pb-3', size === 'sm' ? 'pt-2' : 'pt-3')}
            >
              <Text
                className={cn(
                  'font-semibold transition-colors',
                  size === 'sm' ? 'text-sm' : 'text-body',
                  isActive ? 'text-app-ink' : 'text-app-muted',
                )}
              >
                {tab.label}
              </Text>
              {isActive ? (
                <View className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-rose" />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View className={cn('flex-row items-center gap-1 rounded-xl border border-app-line bg-app-sunken/70 p-1', className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(tab.id)}
            className={cn(
              'flex-1 items-center justify-center rounded-lg px-4 transition-colors',
              size === 'sm' ? 'min-h-8' : 'min-h-10',
              isActive ? 'bg-gradient-warm shadow-card' : 'bg-app-canvas/70 hover:bg-app-brand-soft/70',
            )}
          >
            <Text
              className={cn(
                'font-semibold',
                size === 'sm' ? 'text-sm' : 'text-body-sm',
                isActive ? 'text-app-rose-deep' : 'text-app-muted',
              )}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
