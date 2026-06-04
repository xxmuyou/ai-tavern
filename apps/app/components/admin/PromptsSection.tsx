import { useState } from 'react';
import { Text, View } from 'react-native';

import type { AdminSettingItem } from '@/api/types';
import { WebLoading } from '@/components/web/ui';
import { useAdminSettings } from '@/hooks/use-admin-settings';

import { AdminDropdown } from './AdminDropdown';
import { AdminPanel, AdminPanelHeader } from './AdminPanel';
import { SettingRow } from './SettingsSection';

const WF1_BASE_PROMPT_KEY = 'image_gen.wf1_base_prompt';
const WF_MOMENT_BASE_PROMPT_KEY = 'image_gen.wf_moment_base_prompt';

const PROMPT_MODULES = [
  {
    description:
      'WF1 (base portrait / create): one global prompt prepended to every create generation, across all art styles.',
    id: 'wf1-base',
    label: 'WF1 — base portrait prompt',
  },
  {
    description:
      'WF_MOMENT (chat scene moment / create): a global preamble prepended to every chat moment image prompt.',
    id: 'wf-moment',
    label: 'WF_MOMENT — moment prompt',
  },
] as const;

type PromptModuleId = (typeof PROMPT_MODULES)[number]['id'];

export function PromptsSection() {
  const [moduleId, setModuleId] = useState<PromptModuleId>('wf1-base');
  const active = PROMPT_MODULES.find((module) => module.id === moduleId) ?? PROMPT_MODULES[0];

  return (
    <View className="gap-3">
      <AdminPanel>
        <AdminPanelHeader
          subtitle="System prompts are grouped by module so future prompt surfaces can live here without mixing contexts."
          title="Prompts"
        />
        <AdminDropdown
          labelForValue={(value) => PROMPT_MODULES.find((m) => m.id === value)?.label ?? PROMPT_MODULES[0].label}
          onChange={(value) => setModuleId((value as PromptModuleId) ?? moduleId)}
          options={PROMPT_MODULES.map((module) => ({ label: module.label, value: module.id as string }))}
          value={moduleId}
        />
        <Text className="text-xs leading-5 text-app-muted">{active.description}</Text>
      </AdminPanel>

      {moduleId === 'wf1-base' ? (
        <BasePromptSection
          description="A single style/quality preamble prepended to every WF1 create prompt, regardless of art style."
          missingLabel="WF1 base prompt setting is not registered."
          settingKey={WF1_BASE_PROMPT_KEY}
          title="WF1 base prompt (global)"
        />
      ) : null}
      {moduleId === 'wf-moment' ? (
        <BasePromptSection
          description="A global preamble prepended to every WF_MOMENT chat scene moment prompt."
          missingLabel="WF_MOMENT base prompt setting is not registered."
          settingKey={WF_MOMENT_BASE_PROMPT_KEY}
          title="WF_MOMENT base prompt (global)"
        />
      ) : null}
    </View>
  );
}

function BasePromptSection({
  description,
  missingLabel,
  settingKey,
  title,
}: {
  description: string;
  missingLabel: string;
  settingKey: string;
  title: string;
}) {
  const { settings, isLoading, error, reveal, save } = useAdminSettings();

  if (isLoading) {
    return <WebLoading fullscreen={false} label="Loading prompt..." />;
  }

  const item = settings.find((row) => row.key === settingKey) as AdminSettingItem | undefined;

  return (
    <AdminPanel>
      <AdminPanelHeader error={error} subtitle={description} title={title} />
      {item ? (
        <SettingRow item={item} onReveal={reveal} onSave={save} />
      ) : (
        <Text className="text-body-sm text-app-muted">{missingLabel}</Text>
      )}
    </AdminPanel>
  );
}
