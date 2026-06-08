import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import type { StoryChoice, StoryChoiceResolveResponse, StoryMoment } from '@/api/types';

type StoryMomentPopupProps = {
  isResolving: boolean;
  moment: StoryMoment | null;
  result: StoryChoiceResolveResponse | null;
  sceneName?: string | null;
  visible: boolean;
  onClose: () => void;
  onResolve: (choice: StoryChoice) => void;
};

export function StoryMomentPopup({
  isResolving,
  moment,
  onClose,
  onResolve,
  result,
  sceneName,
  visible,
}: StoryMomentPopupProps) {
  if (!moment) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable className="flex-1 items-center justify-center bg-black/45 px-5" onPress={onClose}>
        <Pressable
          className="w-full max-w-md rounded-2xl bg-app-card p-5 shadow-float"
          onPress={(event) => event.stopPropagation()}
        >
          <Text className="text-xs font-semibold uppercase text-app-primary">
            {sceneName ? `Story at ${sceneName}` : 'Story moment'}
          </Text>
          <Text className="mt-2 text-lg font-semibold text-app-text">{moment.title}</Text>
          <Text className="mt-2 text-sm italic leading-5 text-app-muted">
            {stripNarration(moment.arrival_narration)}
          </Text>
          <Text className="mt-3 text-sm leading-5 text-app-text">{moment.objective}</Text>

          {result ? (
            <View className="mt-4 rounded-xl border border-app-primary/30 bg-app-primarySoft p-3">
              <Text className="text-sm italic leading-5 text-app-text">
                {stripNarration(result.result_narration)}
              </Text>
              {result.transition_mode === 'scene' && result.target_scene ? (
                <Text className="mt-2 text-xs font-semibold text-app-primary">
                  {`You moved to ${result.target_scene.name}.`}
                </Text>
              ) : result.completed_beat ? (
                <Text className="mt-2 text-xs font-semibold text-app-primary">Story moment completed.</Text>
              ) : null}
            </View>
          ) : (
            <View className="mt-4 gap-2">
              {moment.choices.map((choice) => (
                <Pressable
                  key={choice.id}
                  accessibilityRole="button"
                  disabled={isResolving}
                  onPress={() => onResolve(choice)}
                  className={`rounded-xl border border-app-line bg-app-bg px-4 py-3 ${
                    isResolving ? 'opacity-50' : 'opacity-100'
                  }`}
                >
                  <Text className="text-sm font-semibold text-app-text">{choice.label}</Text>
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

function stripNarration(text: string): string {
  return text.replace(/<\/?narration>/gi, '').trim();
}
