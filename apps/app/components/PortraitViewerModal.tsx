import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Image, Modal, Pressable, Text, View, type ImageSourcePropType } from 'react-native';

import type { ChatEmotionKey } from '@/api/types';
import { EMOTION_EMOJI, EMOTION_LABEL, PORTRAIT_ASPECT } from '@/utils/portrait';

export type ViewerEmotion = {
  key: ChatEmotionKey;
  source: ImageSourcePropType;
};

type PortraitViewerModalProps = {
  visible: boolean;
  name: string;
  emotion: ChatEmotionKey | null;
  emotions: ViewerEmotion[];
  onChangeEmotion: (emotion: ChatEmotionKey) => void;
  onClose: () => void;
  // Regenerate support. Only non-neutral expressions can be re-rolled, and only
  // when the viewer (a Pro/admin user) is allowed to.
  canRegenerate?: boolean;
  busyEmotion?: ChatEmotionKey | null;
  onRegenerate?: (emotion: ChatEmotionKey) => void;
};

/**
 * Full-screen lightbox for an unlocked portrait. Opened from the companion
 * profile gallery; lets the player look at the art at full size and switch
 * between the emotions they've unlocked. Only receives unlocked-with-art
 * emotions, so every chip here is viewable.
 */
export function PortraitViewerModal({
  visible,
  name,
  emotion,
  emotions,
  onChangeEmotion,
  onClose,
  canRegenerate = false,
  busyEmotion = null,
  onRegenerate,
}: PortraitViewerModalProps) {
  const active = emotion ?? emotions[0]?.key ?? null;
  const current = emotions.find((item) => item.key === active) ?? emotions[0] ?? null;
  const isRegenerating = active != null && busyEmotion === active;
  const showRegenerate =
    canRegenerate && !!onRegenerate && active != null && active !== 'neutral';

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' }}>
        {/* Tapping the empty backdrop dismisses. */}
        <Pressable
          accessibilityLabel="Close portrait viewer"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <View
          pointerEvents="box-none"
          style={{ flex: 1, paddingTop: 56, paddingBottom: 32, paddingHorizontal: 16 }}
        >
          <View
            className="flex-row items-center justify-between"
            pointerEvents="box-none"
          >
            <View pointerEvents="none">
              <Text className="text-base font-semibold text-white">{name}</Text>
              {active ? (
                <Text className="mt-0.5 text-sm text-white/70">
                  {EMOTION_EMOJI[active]} {EMOTION_LABEL[active]}
                </Text>
              ) : null}
            </View>
            <View className="flex-row items-center gap-2" pointerEvents="box-none">
              {showRegenerate ? (
                <Pressable
                  accessibilityLabel={isRegenerating ? 'Regenerating' : 'Regenerate this portrait'}
                  accessibilityRole="button"
                  disabled={isRegenerating}
                  hitSlop={12}
                  onPress={() => active && onRegenerate?.(active)}
                  className={`h-10 flex-row items-center gap-1.5 rounded-full bg-white/15 px-4 ${
                    isRegenerating ? 'opacity-60' : 'opacity-100'
                  }`}
                >
                  {isRegenerating ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Ionicons color="#FFFFFF" name="refresh" size={18} />
                  )}
                  <Text className="text-xs font-semibold text-white">
                    {isRegenerating ? 'Regenerating…' : 'Regenerate'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={12}
                onPress={onClose}
                className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
              >
                <Ionicons color="#FFFFFF" name="close" size={22} />
              </Pressable>
            </View>
          </View>

          <View
            className="flex-1 items-center justify-center"
            pointerEvents="none"
            style={{ paddingVertical: 24 }}
          >
            {current ? (
              <Image
                accessibilityLabel={active ? `${name}, ${EMOTION_LABEL[active]}` : name}
                resizeMode="contain"
                source={current.source}
                style={{ height: '100%', maxWidth: '100%', aspectRatio: PORTRAIT_ASPECT }}
              />
            ) : null}
          </View>

          {emotions.length > 1 ? (
            <View className="flex-row flex-wrap items-center justify-center gap-2" pointerEvents="box-none">
              {emotions.map((item) => {
                const selected = item.key === active;
                return (
                  <Pressable
                    accessibilityLabel={EMOTION_LABEL[item.key]}
                    accessibilityRole="button"
                    key={item.key}
                    onPress={() => onChangeEmotion(item.key)}
                    className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${
                      selected ? 'bg-white' : 'bg-white/15'
                    }`}
                  >
                    <Text className="text-sm">{EMOTION_EMOJI[item.key]}</Text>
                    <Text className={`text-xs font-medium ${selected ? 'text-black' : 'text-white'}`}>
                      {EMOTION_LABEL[item.key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
