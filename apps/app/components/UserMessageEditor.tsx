import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

type UserMessageEditorProps = {
  text: string;
  isSaving: boolean;
  onChangeText: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

/** Inline editor that replaces a user bubble while it is being edited. */
export function UserMessageEditor({ text, isSaving, onChangeText, onSave, onCancel }: UserMessageEditorProps) {
  return (
    <View className="w-full items-end px-4 py-1.5">
      <View className="w-[80%] gap-2">
        <TextInput
          multiline
          autoFocus
          editable={!isSaving}
          value={text}
          onChangeText={onChangeText}
          placeholderTextColor="#687076"
          textAlignVertical="top"
          className="min-h-12 rounded-2xl border border-app-primary bg-white px-4 py-2.5 text-base text-app-text"
        />
        <View className="flex-row items-center justify-end gap-4">
          <Pressable accessibilityRole="button" disabled={isSaving} onPress={onCancel}>
            <Text className="text-sm font-semibold text-app-muted">Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={isSaving || text.trim().length === 0} onPress={onSave}>
            {isSaving ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text
                className={`text-sm font-semibold ${text.trim().length === 0 ? 'text-app-muted/50' : 'text-app-primary'}`}
              >
                Save &amp; regenerate
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
