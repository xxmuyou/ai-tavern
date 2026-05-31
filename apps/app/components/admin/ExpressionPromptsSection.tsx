import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import type { ExpressionGender, ExpressionPromptItem } from '@/api/types';
import { Button } from '@/components/Button';
import { useAdminExpressionPrompts } from '@/hooks/use-admin-expression-prompts';

const GENDERS: ExpressionGender[] = ['female', 'male'];

export function ExpressionPromptsSection() {
  const { prompts, isLoading, error, save } = useAdminExpressionPrompts();

  if (isLoading) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color="#1E6B52" />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-lg font-semibold text-app-text">WF2 expression prompts</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Pose/expression prompt per gender × emotion, used to generate companion portrait variants.
        </Text>
        {error ? <Text className="mt-2 text-sm font-semibold text-app-danger">{error}</Text> : null}
      </View>

      {GENDERS.map((gender) => {
        const rows = prompts.filter((p) => p.gender === gender);
        if (rows.length === 0) return null;
        return (
          <View key={gender} className="rounded-lg border border-app-line bg-white p-5">
            <Text className="text-base font-semibold capitalize text-app-text">{gender}</Text>
            <View className="mt-3 gap-3">
              {rows.map((row) => (
                <PromptRow key={`${row.gender}-${row.emotion}`} row={row} onSave={save} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function PromptRow({
  row,
  onSave,
}: {
  row: ExpressionPromptItem;
  onSave: (gender: ExpressionGender, emotion: string, prompt: string) => Promise<void>;
}) {
  const [value, setValue] = useState(row.prompt);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(row.prompt);
  }, [row.prompt]);

  const dirty = value.trim() !== row.prompt.trim();

  async function submit() {
    if (!value.trim() || !dirty) return;
    setBusy(true);
    try {
      await onSave(row.gender, row.emotion, value.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-2 rounded-lg border border-app-line bg-app-bg p-4">
      <Text className="text-sm font-semibold capitalize text-app-text">{row.emotion}</Text>
      <TextInput
        className="min-h-20 rounded-lg border border-app-line bg-white px-3 py-3 text-base text-app-text"
        multiline
        onChangeText={setValue}
        placeholder="pose / expression intent..."
        placeholderTextColor="#687076"
        textAlignVertical="top"
        value={value}
      />
      <View className="flex-row items-center justify-between">
        {row.updated_by_email ? (
          <Text className="text-xs text-app-muted">updated by {row.updated_by_email}</Text>
        ) : (
          <View />
        )}
        <View className="w-28">
          <Button disabled={busy || !dirty} isLoading={busy} label="Save" onPress={() => void submit()} />
        </View>
      </View>
    </View>
  );
}
