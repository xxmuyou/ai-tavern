import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import type { ChatUnlock } from '@/api/types';

const VISIBLE_MS = 4500;

/**
 * spec-025 §B5: lightweight celebration shown when the chat SSE reports newly
 * unlocked content. `token` increments once per unlock batch so it re-shows
 * even for repeated unlock kinds. Self-clearing, non-interactive overlay.
 */
export function UnlockCelebration({
  unlocks,
  token,
}: {
  unlocks: ChatUnlock[] | null;
  token: number;
}) {
  const [items, setItems] = useState<ChatUnlock[]>([]);

  useEffect(() => {
    if (!unlocks || unlocks.length === 0) {
      return;
    }
    setItems(unlocks);
    const id = globalThis.setTimeout(() => setItems([]), VISIBLE_MS);
    return () => globalThis.clearTimeout(id);
    // Re-run per batch via `token`; reading latest `unlocks` is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (items.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="none" className="items-center px-4 py-2">
      <View className="w-full max-w-md rounded-2xl border border-app-primary/30 bg-app-primarySoft px-4 py-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-app-primary">
          ✦ Unlocked
        </Text>
        <View className="mt-1 gap-0.5">
          {items.map((item) => (
            <Text key={item.key} className="text-sm font-medium text-app-text">
              {item.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
