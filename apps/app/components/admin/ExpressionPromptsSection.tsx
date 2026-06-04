import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import type { ExpressionGender, ExpressionPromptItem } from '@/api/types';
import { WebButton, WebFieldRow, WebLoading, WebTextarea } from '@/components/web/ui';
import { useAdminExpressionPrompts } from '@/hooks/use-admin-expression-prompts';

import { AdminPanel, AdminPanelHeader } from './AdminPanel';

const GENDERS: ExpressionGender[] = ['female', 'male'];

export function ExpressionPromptsSection() {
  const { prompts, isLoading, error, save } = useAdminExpressionPrompts();

  if (isLoading) {
    return <WebLoading fullscreen={false} label="Loading expression prompts..." />;
  }

  return (
    <View className="gap-3">
      <AdminPanel>
        <AdminPanelHeader
          error={error}
          subtitle="Pose/expression prompt per gender × emotion, used to generate companion portrait variants."
          title="WF2 expression prompts"
        />
      </AdminPanel>

      {GENDERS.map((gender) => {
        const rows = prompts.filter((p) => p.gender === gender);
        if (rows.length === 0) return null;
        return (
          <AdminPanel key={gender}>
            <AdminPanelHeader title={gender} />
            <View className="gap-2">
              {rows.map((row) => (
                <PromptRow key={`${row.gender}-${row.emotion}`} row={row} onSave={save} />
              ))}
            </View>
          </AdminPanel>
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
    <View className="rounded-lg border border-app-line bg-app-sunken/60 p-3">
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
