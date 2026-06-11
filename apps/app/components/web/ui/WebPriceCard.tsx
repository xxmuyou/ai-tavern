import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from './cn';

export type WebPriceCardProps = {
  children?: ReactNode;
  className?: string;
  cta?: ReactNode;
  description?: string;
  features?: string[];
  highlight?: boolean;
  price?: string;
  priceUnit?: string;
  title: string;
};

export function WebPriceCard({
  children,
  className,
  cta,
  description,
  features = [],
  highlight = false,
  price,
  priceUnit,
  title,
}: WebPriceCardProps) {
  return (
    <View
      className={cn(
        'flex-1 gap-5 rounded-2xl border p-7 transition-shadow',
        highlight
          ? 'border-rose/40 bg-gradient-warm shadow-float'
          : 'border-white/10 bg-white/[0.06] shadow-card',
        className,
      )}
    >
      <View className="gap-2">
        {highlight ? (
          <View className="self-start rounded-full bg-rose px-2.5 py-0.5">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-white">Most loved</Text>
          </View>
        ) : null}
        <Text className="font-serif text-title text-white">{title}</Text>
        {description ? (
          <Text className="text-body-sm leading-6 text-rose-50/60">{description}</Text>
        ) : null}
      </View>

      {price ? (
        <View className="flex-row items-baseline gap-1">
          <Text className="font-serif text-display-md text-white">{price}</Text>
          {priceUnit ? <Text className="text-caption text-rose-50/60">{priceUnit}</Text> : null}
        </View>
      ) : null}

      {features.length ? (
        <View className="gap-2.5">
          {features.map((feature) => (
            <View key={feature} className="flex-row items-start gap-2.5">
              <Ionicons color={highlight ? '#fecdd3' : '#b7f7dc'} name="checkmark-circle" size={18} />
              <Text className="flex-1 text-body-sm text-rose-50/75">{feature}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {cta ? <View className="mt-2">{cta}</View> : null}
      {children}
    </View>
  );
}
