import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ChatUnlock } from '@/api/types';

const VISIBLE_MS = 4500;

/**
 * spec-025 §B5: lightweight celebration shown when the chat SSE reports newly
 * unlocked content. `token` increments once per unlock batch so it re-shows
 * even for repeated unlock kinds. Self-clearing, non-interactive overlay.
 */
export function UnlockCelebration({
  unlocks,
  onInviteScene,
  onViewScene,
  token,
}: {
  unlocks: ChatUnlock[] | null;
  onInviteScene?: (unlock: ChatUnlock) => void;
  onViewScene?: (unlock: ChatUnlock) => void;
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
  const sceneItems = items.filter((item) => item.kind === 'scene' && item.scene_id);

  return (
    <View className="items-center px-4 py-2">
      <View className="w-full max-w-md rounded-2xl border border-app-primary/30 bg-app-primarySoft px-4 py-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-app-primary">
          Unlocked
        </Text>
        <View className="mt-1 gap-0.5">
          {items.map((item) => (
            <Text key={item.key} className="text-sm font-medium text-app-text">
              {item.label}
            </Text>
          ))}
        </View>
        {sceneItems.length > 0 ? (
          <View className="mt-3 flex-row flex-wrap gap-2">
            {onInviteScene ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onInviteScene(sceneItems[0])}
                className="rounded-full bg-app-primary px-3 py-1.5"
              >
                <Text className="text-xs font-semibold text-white">Invite now</Text>
              </Pressable>
            ) : null}
            {onViewScene ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onViewScene(sceneItems[0])}
                className="rounded-full border border-app-primary/30 px-3 py-1.5"
              >
                <Text className="text-xs font-semibold text-app-primary">View scene</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
