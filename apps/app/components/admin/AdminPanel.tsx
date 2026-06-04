import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { WebCard, cn } from '@/components/web/ui';

/**
 * Compact admin building blocks. Admin sections are dense, CLI/extension-style:
 * small padding, small type, and collapsible rows so long catalogs don't become
 * one giant scroll. Replaces the per-section big `WebCard padding="md"` + text-lg
 * headers.
 */

export function AdminPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <WebCard className={cn('gap-3', className)} padding="sm">
      {children}
    </WebCard>
  );
}

export function AdminPanelHeader({
  error,
  subtitle,
  title,
}: {
  error?: string | null;
  subtitle?: string;
  title: string;
}) {
  return (
    <View>
      <Text className="text-sm font-semibold text-app-ink">{title}</Text>
      {subtitle ? <Text className="mt-0.5 text-xs leading-5 text-app-muted">{subtitle}</Text> : null}
      {error ? <Text className="mt-1 text-xs font-semibold text-rose-deep">{error}</Text> : null}
    </View>
  );
}

/**
 * A titled row that collapses its body behind a chevron. Collapsed it shows only
 * the title (+ optional right slot); expanded it reveals the editing fields.
 */
export function AdminCollapsible({
  children,
  defaultOpen = false,
  right,
  subtitle,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
  subtitle?: string;
  title: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View className="overflow-hidden rounded-lg border border-app-line bg-app-sunken/60">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        className="flex-row items-center gap-2 px-3 py-2 hover:bg-rose-soft/50"
      >
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Ionicons color="#9A2F4F" name="chevron-forward" size={14} />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-semibold text-app-ink">
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} className="text-xs text-app-muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View>{right}</View> : null}
      </Pressable>
      {open ? <View className="gap-3 border-t border-app-line px-3 py-3">{children}</View> : null}
    </View>
  );
}
