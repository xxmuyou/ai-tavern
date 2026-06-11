import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { cn } from './cn';

type WebArticleProps = {
  children?: ReactNode;
  className?: string;
  eyebrow?: string;
  lead?: string;
  title: string;
};

/**
 * Long-form editorial block — used for landing hero copy, scene intros,
 * and any place we want to lean into the "Lora headline + Inter body"
 * typography rhythm.
 */
export function WebArticle({ children, className, eyebrow, lead, title }: WebArticleProps) {
  return (
    <View className={cn('gap-4', className)}>
      {eyebrow ? <Text className="text-overline text-rose-200">{eyebrow}</Text> : null}
      <Text className="font-serif text-display-md text-white">{title}</Text>
      {lead ? (
        <Text className="max-w-2xl text-body-lg leading-8 text-rose-50/75">{lead}</Text>
      ) : null}
      {children}
    </View>
  );
}
