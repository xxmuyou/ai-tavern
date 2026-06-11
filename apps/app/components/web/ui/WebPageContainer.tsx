import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { cn } from './cn';

export type WebPageContainerProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  scroll?: boolean;
};

const maxWidthClass = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  '2xl': 'max-w-[1440px]',
  '3xl': 'max-w-[1600px]',
  full: 'max-w-none',
};

export function WebPageContainer({
  children,
  className,
  contentClassName,
  maxWidth = 'xl',
  scroll = true,
}: WebPageContainerProps) {
  const inner = (
    <View className={cn('mx-auto w-full px-8 py-10', maxWidthClass[maxWidth], contentClassName)}>
      {children}
    </View>
  );

  if (scroll) {
    return (
      <ScrollView
        className={cn('editorial-scroll min-h-0 flex-1 bg-[#10070d]', className)}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {inner}
      </ScrollView>
    );
  }

  return <View className={cn('min-h-0 flex-1 bg-[#10070d]', className)}>{inner}</View>;
}
