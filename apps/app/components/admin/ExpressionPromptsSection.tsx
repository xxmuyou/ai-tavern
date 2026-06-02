import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import type { ExpressionGender, ExpressionPromptItem } from '@/api/types';
import { WebButton, WebCard, WebFieldRow, WebLoading, WebTextarea } from '@/components/web/ui';
import { useAdminExpressionPrompts } from '@/hooks/use-admin-expression-prompts';

const GENDERS: ExpressionGender[] = ['female', 'male'];

export function ExpressionPromptsSection() {
  const { prompts, isLoading, error, save } = useAdminExpressionPrompts();

  if (isLoading) {
    return <WebLoading fullscreen={false} label="Loading expression prompts..." />;
  }

  return (
    <View className="gap-4">
      <WebCard padding="md">
        <Text className="font-serif text-title text-app-ink">WF2 expression prompts</Text>
        <Text className="mt-1 text-body-sm leading-6 text-app-muted">
          Pose/expression prompt per gender × emotion, used to generate companion portrait variants.
        </Text>
        {error ? <Text className="mt-2 text-body-sm font-semibold text-rose-deep">{error}</Text> : null}
      </WebCard>

      {GENDERS.map((gender) => {
        const rows = prompts.filter((p) => p.gender === gender);
        if (rows.length === 0) return null;
        return (
          <WebCard key={gender} padding="md">
            <Text className="font-serif text-title-sm capitalize text-app-ink">{gender}</Text>
            <View className="mt-3 gap-3">
              {rows.map((row) => (
                <PromptRow key={`${row.gender}-${row.emotion}`} row={row} onSave={save} />
              ))}
            </View>
          </WebCard>
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
    <View className="rounded-xl border border-app-line bg-app-sunken/60 p-4">
      <WebFieldRow
        description={row.updated_by_email ? `updated by ${row.updated_by_email}` : undefined}
        label={row.emotion}
        trailing={
          <WebButton disabled={busy || !dirty} isLoading={busy} label="Save" onPress={() => void submit()} size="sm" />
        }
      />
      <View className="mt-3">
        <WebTextarea
          inputClassName="min-h-20"
          onChangeText={setValue}
          placeholder="pose / expression intent..."
          value={value}
        />
      </View>
    </View>
  );
}
