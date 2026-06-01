import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import type { AdminSettingItem } from '@/api/types';
import { useAdminSettings } from '@/hooks/use-admin-settings';

import { AdminDropdown } from './AdminDropdown';
import { ExpressionPromptsSection } from './ExpressionPromptsSection';
import { SettingRow } from './SettingsSection';

const WF1_BASE_PROMPT_KEY = 'image_gen.wf1_base_prompt';

const PROMPT_MODULES = [
  {
    description:
      'WF1 (base portrait / create): one global prompt prepended to every create generation, across all art styles.',
    id: 'wf1-base',
    label: 'WF1 — base portrait prompt',
  },
  {
    description:
      'WF2 (expression variants / variation): pose & expression prompt per gender × emotion, used to generate portrait variants.',
    id: 'expression-portraits',
    label: 'WF2 — expression prompts',
  },
] as const;

type PromptModuleId = (typeof PROMPT_MODULES)[number]['id'];

export function PromptsSection() {
  const [moduleId, setModuleId] = useState<PromptModuleId>('wf1-base');
  const active = PROMPT_MODULES.find((module) => module.id === moduleId) ?? PROMPT_MODULES[0];

  return (
    <View className="gap-4">
      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-lg font-semibold text-app-text">Prompts</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          System prompts are grouped by module so future prompt surfaces can live here without mixing contexts.
        </Text>
        <View className="mt-4">
          <AdminDropdown
            labelForValue={(value) =>
              PROMPT_MODULES.find((module) => module.id === value)?.label ?? PROMPT_MODULES[0].label
            }
            onChange={(value) => setModuleId((value as PromptModuleId) ?? moduleId)}
            options={PROMPT_MODULES.map((module) => ({ label: module.label, value: module.id as string }))}
            value={moduleId}
          />
          <Text className="mt-2 text-sm text-app-muted">{active.description}</Text>
        </View>
      </View>

      {moduleId === 'wf1-base' ? <Wf1BasePromptSection /> : null}
      {moduleId === 'expression-portraits' ? <ExpressionPromptsSection /> : null}
    </View>
  );
}

function Wf1BasePromptSection() {
  const { settings, isLoading, error, reveal, save } = useAdminSettings();

  if (isLoading) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color="#1E6B52" />
      </View>
    );
  }

  const item = settings.find((row) => row.key === WF1_BASE_PROMPT_KEY) as AdminSettingItem | undefined;

  return (
    <View className="rounded-lg border border-app-line bg-white p-5">
      <Text className="text-base font-semibold text-app-text">WF1 base prompt (global)</Text>
      <Text className="mt-1 text-sm leading-6 text-app-muted">
        A single style/quality preamble prepended to every WF1 create prompt, regardless of art style.
      </Text>
      {error ? <Text className="mt-2 text-sm font-semibold text-app-danger">{error}</Text> : null}
      <View className="mt-4">
        {item ? (
          <SettingRow item={item} onReveal={reveal} onSave={save} />
        ) : (
          <Text className="text-sm text-app-muted">WF1 base prompt setting is not registered.</Text>
        )}
      </View>
    </View>
  );
}
