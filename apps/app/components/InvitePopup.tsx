import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { InviteTarget } from '@/api/types';

type InvitePopupProps = {
  visible: boolean;
  loading: boolean;
  targets: InviteTarget[];
  companionName: string;
  onSelect: (target: InviteTarget) => void;
  onClose: () => void;
};

/**
 * spec-036/037: the "invite to go somewhere" picker. Lists active scenes the
 * user has unlocked. Picking one immediately sends a default invitation; the
 * companion then decides whether to actually go.
 */
export function InvitePopup({
  visible,
  loading,
  targets,
  companionName,
  onSelect,
  onClose,
}: InvitePopupProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable className="flex-1 items-center justify-center bg-black/40 px-6" onPress={onClose}>
        <Pressable
          className="w-full max-w-md rounded-2xl bg-app-card p-5"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-lg font-semibold text-app-text">Invite {companionName} somewhere</Text>
          <Text className="mt-1 text-sm text-app-muted">
            Pick a place to send an invitation now. They might say yes — or not.
          </Text>

          <View className="mt-4">
            {loading ? (
              <View className="items-center py-8">
                <ActivityIndicator color="#6E59C7" />
              </View>
            ) : targets.length === 0 ? (
              <View className="rounded-xl border border-app-line bg-app-bg p-4">
                <Text className="text-sm text-app-muted">
                  No places to invite them to yet. Grow your relationship to unlock more.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                <View className="gap-2">
                  {targets.map((target) => {
                    const thumb = mediaSource(target.art_url);
                    return (
                      <Pressable
                        key={target.id}
                        accessibilityRole="button"
                        onPress={() => onSelect(target)}
                        className="flex-row items-center gap-3 rounded-xl border border-app-line bg-app-bg p-2 active:opacity-70"
                      >
                        <View className="h-14 w-14 overflow-hidden rounded-lg bg-app-primarySoft">
                          {thumb ? (
                            <Image source={thumb} resizeMode="cover" className="h-full w-full" />
                          ) : null}
                        </View>
                        <View className="flex-1">
                          <Text className="text-base font-medium text-app-text">{target.name}</Text>
                          <Text numberOfLines={1} className="text-xs text-app-muted">
                            {target.mood}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="mt-4 items-center rounded-xl border border-app-line py-2.5"
          >
            <Text className="text-sm font-medium text-app-muted">Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
