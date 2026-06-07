import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import type { EventResponseItem, EventResolveResponse } from '@/api/types';

type EventPopupProps = {
  event: EventResponseItem | null;
  isResolving: boolean;
  result: EventResolveResponse | null;
  visible: boolean;
  onClose: () => void;
  onResolve: (event: EventResponseItem, optionId: string) => void;
};

const EVENT_TITLES: Record<EventResponseItem['event_type'], string> = {
  confession: 'A confession',
  conflict: 'A tense moment',
  gift: 'A small gift',
  invitation: 'An invitation',
  milestone: 'A milestone',
};

export function EventPopup({
  event,
  isResolving,
  onClose,
  onResolve,
  result,
  visible,
}: EventPopupProps) {
  if (!event) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable className="flex-1 items-center justify-center bg-black/45 px-5" onPress={onClose}>
        <Pressable
          className="w-full max-w-md rounded-2xl bg-app-card p-5 shadow-float"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-xs font-semibold uppercase text-app-primary">
            {EVENT_TITLES[event.event_type]}
          </Text>
          <Text className="mt-2 text-base leading-6 text-app-text">{event.payload.description}</Text>

          {result ? (
            <View className="mt-4 rounded-xl border border-app-primary/30 bg-app-primarySoft p-3">
              <Text className="text-sm leading-5 text-app-text">{result.result.description}</Text>
              {result.level_changed ? (
                <Text className="mt-2 text-xs font-semibold text-app-primary">
                  {`Relationship changed: ${result.level_changed}`}
                </Text>
              ) : null}
            </View>
          ) : (
            <View className="mt-4 gap-2">
              {event.payload.options.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  disabled={isResolving}
                  onPress={() => onResolve(event, option.id)}
                  className={`rounded-xl border border-app-line bg-app-bg px-4 py-3 ${
                    isResolving ? 'opacity-50' : 'opacity-100'
                  }`}
                >
                  <Text className="text-sm font-semibold text-app-text">{option.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={isResolving}
            onPress={onClose}
            className="mt-4 min-h-10 items-center justify-center rounded-xl border border-app-line"
          >
            {isResolving ? (
              <ActivityIndicator color="#6E59C7" />
            ) : (
              <Text className="text-sm font-semibold text-app-muted">{result ? 'Done' : 'Later'}</Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
