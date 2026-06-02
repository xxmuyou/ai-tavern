import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from './cn';

export type WebCardVariant = 'elevated' | 'flat' | 'outline' | 'glass' | 'sunken';

export type WebCardProps = {
  children?: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: WebCardVariant;
};

const variantClass: Record<WebCardVariant, string> = {
  elevated: 'bg-app-surface border border-app-line shadow-card',
  flat: 'bg-app-surface border border-app-line',
  outline: 'bg-transparent border border-app-line',
  glass: 'bg-app-surface/70 border border-white/40 backdrop-blur-md shadow-card',
  sunken: 'bg-app-sunken/60 border border-app-line-soft',
};

const paddingClass = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function WebCard({ children, className, padding = 'md', variant = 'elevated' }: WebCardProps) {
  return <View className={cn('rounded-2xl', variantClass[variant], paddingClass[padding], className)}>{children}</View>;
}

export function WebPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <WebCard className={className} padding="md" variant="elevated">
      {children}
    </WebCard>
  );
}
