import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { ChatUnlock } from '@/api/types';
import type { ChatLanguage } from '@/utils/chat-language';

export type WebCelebrationItem =
  | ChatUnlock
  | {
      key: string;
      kind: 'achievement';
      label: string;
    };

const COPY = {
  en: {
    achievement: 'Achievement',
    close: 'Close',
    keepChatting: 'Keep chatting',
    scene: 'New place',
    secret: 'New story detail',
    title: 'Relationship milestone',
    unlocked: 'Unlocked',
    viewProfile: 'View profile',
    viewScene: 'View scene',
  },
  zh: {
    achievement: '成就',
    close: '关闭',
    keepChatting: '继续聊天',
    scene: '新场景',
    secret: '新故事',
    title: '关系里程碑',
    unlocked: '已解锁',
    viewProfile: '查看角色',
    viewScene: '查看场景',
  },
} as const;

const FIREWORKS = [
  { color: '#FBE6EC', left: '18%', size: 180, top: '24%', delay: '0ms' },
  { color: '#D97757', left: '78%', size: 220, top: '22%', delay: '220ms' },
  { color: '#C9486B', left: '28%', size: 160, top: '70%', delay: '420ms' },
  { color: '#FCE3D6', left: '70%', size: 150, top: '68%', delay: '620ms' },
] as const;

const CONFETTI = Array.from({ length: 18 }, (_, index) => ({
  delay: `${(index % 6) * 180}ms`,
  left: `${8 + ((index * 7) % 86)}%`,
  top: `${8 + ((index * 11) % 28)}%`,
  color: index % 3 === 0 ? '#FBE6EC' : index % 3 === 1 ? '#D97757' : '#C9486B',
}));

type Props = {
  item: WebCelebrationItem | null;
  language: ChatLanguage;
  onClose: () => void;
  onViewProfile: () => void;
  onViewScene: (sceneId: string) => void;
};

export function WebUnlockCelebrationOverlay({
  item,
  language,
  onClose,
  onViewProfile,
  onViewScene,
}: Props) {
  const copy = COPY[language];

  useEffect(() => {
    if (!item) return;
    const id = globalThis.setTimeout(onClose, 6200);
    return () => globalThis.clearTimeout(id);
  }, [item, onClose]);

  if (!item) return null;

  const isScene = item.kind === 'scene' && 'scene_id' in item && Boolean(item.scene_id);
  const eyebrow = item.kind === 'scene'
    ? copy.scene
    : item.kind === 'secret'
      ? copy.secret
      : item.kind === 'achievement'
        ? copy.achievement
        : copy.title;

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <View className="relative flex-1 items-center justify-center overflow-hidden bg-app-twilight/90 px-6">
        {FIREWORKS.map((firework, index) => (
          <View
            className="web-firework absolute rounded-full border"
            key={`firework-${index}`}
            style={[
              styles.firework,
              {
                animationDelay: firework.delay,
                borderColor: firework.color,
                height: firework.size,
                left: firework.left,
                top: firework.top,
                width: firework.size,
              } as unknown as ViewStyle,
            ]}
          />
        ))}
        {CONFETTI.map((piece, index) => (
          <View
            className="web-confetti absolute rounded-sm"
            key={`confetti-${index}`}
            style={[
              styles.confetti,
              {
                animationDelay: piece.delay,
                backgroundColor: piece.color,
                left: piece.left,
                top: piece.top,
              } as unknown as ViewStyle,
            ]}
          />
        ))}

        <View className="web-unlock-pop w-full max-w-2xl items-center px-4">
          <View className="mb-6 h-20 w-20 items-center justify-center rounded-full bg-rose shadow-glow">
            <Ionicons color="#FFFFFF" name={isScene ? 'map' : 'sparkles'} size={34} />
          </View>
          <Text className="text-overline text-rose-soft">{copy.unlocked}</Text>
          <Text className="mt-4 text-center font-serif text-display-lg text-white">{item.label}</Text>
          <Text className="mt-3 text-center text-title-sm font-semibold text-white/72">{eyebrow}</Text>

          <View className="mt-8 w-full max-w-sm gap-3">
            {isScene ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onViewScene((item as ChatUnlock).scene_id!);
                }}
                className="min-h-12 items-center justify-center rounded-xl bg-rose px-4 shadow-glow"
              >
                <Text className="text-body-sm font-semibold text-white">{copy.viewScene}</Text>
              </Pressable>
            ) : item.kind === 'achievement' ? (
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                className="min-h-12 items-center justify-center rounded-xl bg-rose px-4 shadow-glow"
              >
                <Text className="text-body-sm font-semibold text-white">{copy.keepChatting}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onViewProfile();
                }}
                className="min-h-12 items-center justify-center rounded-xl bg-rose px-4 shadow-glow"
              >
                <Text className="text-body-sm font-semibold text-white">{copy.viewProfile}</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              className="min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/10"
            >
              <Text className="text-body-sm font-semibold text-white/70">{copy.close}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  firework: {
    opacity: 0,
  } as unknown as ViewStyle,
  confetti: {
    height: 14,
    opacity: 0,
    width: 7,
  } as unknown as ViewStyle,
});
