import { useState } from 'react';
import { Text, View } from 'react-native';

import type { AdminSettingItem } from '@/api/types';
import { WebLoading } from '@/components/web/ui';
import { useAdminSettings } from '@/hooks/use-admin-settings';

import { AdminDropdown } from './AdminDropdown';
import { AdminPanel, AdminPanelHeader } from './AdminPanel';
import { SettingRow } from './SettingsSection';

const PORTRAIT_CREATE_BASE_PROMPT_KEY = 'image_gen.portrait_create_base_prompt';
const CHAT_MOMENT_BASE_PROMPT_KEY = 'image_gen.chat_moment_base_prompt';

const PROMPT_MODULES = [
  {
    description:
      'Portrait create: one global prompt prepended to every create generation, across Anime and Realistic lanes.',
    id: 'portrait-create',
    label: 'Portrait create prompt',
  },
  {
    description:
      'Chat moment: a global preamble prepended to every chat moment image prompt.',
    id: 'chat-moment',
    label: 'Chat moment prompt',
  },
] as const;

type PromptModuleId = (typeof PROMPT_MODULES)[number]['id'];

export function PromptsSection() {
  const [moduleId, setModuleId] = useState<PromptModuleId>('portrait-create');
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

      {moduleId === 'portrait-create' ? (
        <BasePromptSection
          description="A single style/quality preamble prepended to every portrait create prompt, across Anime and Realistic lanes."
          missingLabel="Portrait create base prompt setting is not registered."
          settingKey={PORTRAIT_CREATE_BASE_PROMPT_KEY}
          title="Portrait create base prompt"
        />
      ) : null}
      {moduleId === 'chat-moment' ? (
        <BasePromptSection
          description="A global preamble prepended to every chat moment prompt."
          missingLabel="Chat moment base prompt setting is not registered."
          settingKey={CHAT_MOMENT_BASE_PROMPT_KEY}
          title="Chat moment base prompt"
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
