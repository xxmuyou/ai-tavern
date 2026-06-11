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
  elevated: 'bg-white/[0.06] border border-white/10 shadow-card',
  flat: 'bg-white/[0.06] border border-white/10',
  outline: 'bg-transparent border border-white/10',
  glass: 'bg-white/[0.055] border border-white/40 backdrop-blur-md shadow-card',
  sunken: 'bg-white/[0.08] border border-white/8',
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
