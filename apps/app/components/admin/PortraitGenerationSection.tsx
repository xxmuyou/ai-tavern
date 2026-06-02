import { useState } from 'react';
import { Text, View } from 'react-native';

import type { AdminSettingItem } from '@/api/types';
import { WebButton, WebCard, WebLoading } from '@/components/web/ui';
import { useAdminSettings } from '@/hooks/use-admin-settings';

import { AdminDropdown } from './AdminDropdown';
import { ImageGenJobsSection } from './ImageGenJobsSection';
import { ImageModelsSection } from './ImageModelsSection';
import { SettingRow, SourceTag } from './SettingsSection';
import type { RevealSettingFn, SaveSettingFn } from './SettingsSection';

const DEFAULT_PROVIDER_KEY = 'image_gen.provider';
const WF1_PROVIDER_KEY = 'image_gen.wf1_provider';
const WF2_PROVIDER_KEY = 'image_gen.wf2_provider';
const WF_MOMENT_PROVIDER_KEY = 'image_gen.wf_moment_provider';
// Engines the backend can actually route to (see image-gen/index.ts).
const IMAGE_PROVIDERS = ['mock', 'runninghub', 'openai'] as const;

// RunningHub infra shared by WF1, WF2, and WF_MOMENT when any workflow runs on runninghub.
const RUNNINGHUB_SHARED_KEYS = [
  'image_gen.runninghub_base_url',
  'image_gen.api_key',
  'image_gen.webhook_url',
  'image_gen.webhook_secret',
  'image_gen.public_base_url',
  'image_gen.r2_signing_key',
] as const;
const OPENAI_KEYS = [
  'image_gen.openai_api_key',
  'image_gen.openai_model',
  'image_gen.openai_image_size',
] as const;

const WORKFLOWS = [
  { id: 'wf1', mode: 'create', label: 'WF1 - base portrait (create)', providerKey: WF1_PROVIDER_KEY },
  { id: 'wf2', mode: 'variation', label: 'WF2 - expression variants (variation)', providerKey: WF2_PROVIDER_KEY },
  { id: 'wf_moment', mode: 'create', label: 'WF_MOMENT - chat scene moment (create)', providerKey: WF_MOMENT_PROVIDER_KEY },
] as const;

type Workflow = (typeof WORKFLOWS)[number];
type WorkflowId = Workflow['id'];

export function PortraitGenerationSection() {
  const { settings, isLoading, error, reveal, save } = useAdminSettings();
  const [workflowId, setWorkflowId] = useState<WorkflowId>('wf1');

  if (isLoading) {
    return <WebLoading fullscreen={false} label="Loading portrait generation settings..." />;
  }

  const byKey = (key: string) => settings.find((item) => item.key === key) ?? null;
  // Live generation defaults to RunningHub; admins opt into OpenAI per workflow.
  const defaultProvider = byKey(DEFAULT_PROVIDER_KEY)?.value?.trim() || 'runninghub';
  const workflow = WORKFLOWS.find((w) => w.id === workflowId) ?? WORKFLOWS[0];

  return (
    <View className="gap-4">
      <WebCard padding="md">
        <Text className="font-serif text-title text-app-ink">Portrait generation</Text>
        <Text className="mt-1 text-body-sm leading-6 text-app-muted">
          Pick a workflow to edit. WF1 (create), WF2 (variation), and WF_MOMENT (chat scene moment)
          each choose their own engine and switch independently. Checkpoints are managed per workflow
          in its model catalog.
        </Text>
        {error ? <Text className="mt-2 text-body-sm font-semibold text-rose-deep">{error}</Text> : null}
        <View className="mt-4">
          <AdminDropdown
            labelForValue={(value) => WORKFLOWS.find((w) => w.id === value)?.label ?? WORKFLOWS[0].label}
            onChange={(value) => setWorkflowId((value as WorkflowId) ?? workflowId)}
            options={WORKFLOWS.map((w) => ({ label: w.label, value: w.id as string }))}
            value={workflowId}
          />
        </View>
      </WebCard>

      <WorkflowPanel
        byKey={byKey}
        defaultProvider={defaultProvider}
        onReveal={reveal}
        onSave={save}
        workflow={workflow}
      />

      <ImageGenJobsSection />
    </View>
  );
}

function WorkflowPanel({
  byKey,
  defaultProvider,
  onReveal,
  onSave,
  workflow,
}: {
  byKey: (key: string) => AdminSettingItem | null;
  defaultProvider: string;
  onReveal: RevealSettingFn;
  onSave: SaveSettingFn;
  workflow: Workflow;
}) {
  const providerSetting = byKey(workflow.providerKey);
  const [saving, setSaving] = useState(false);
  // Empty per-workflow value falls back to the default provider (matches backend).
  const selected = providerSetting?.value?.trim() || defaultProvider;

  async function setProvider(provider: string) {
    if (!providerSetting || provider === (providerSetting.value?.trim() || '')) return;
    setSaving(true);
    try {
      await onSave(workflow.providerKey, provider);
    } finally {
      setSaving(false);
    }
  }

  const rowsFor = (keys: readonly string[]) =>
    keys
      .map((key) => byKey(key))
      .filter((item): item is AdminSettingItem => item != null)
      .map((item) => <SettingRow key={item.key} item={item} onReveal={onReveal} onSave={onSave} />);

  return (
    <WebCard className="gap-4" padding="md">
      <View>
        <Text className="font-serif text-title-sm text-app-ink">{workflow.label}</Text>
        <Text className="mt-1 text-caption text-app-muted">
          Empty falls back to the default provider ({defaultProvider}).
        </Text>
      </View>

      {providerSetting ? (
        <View className="gap-3">
          <AdminDropdown
            labelForValue={(value) => value ?? 'Select provider'}
            onChange={(value) => void setProvider(value ?? selected)}
            options={IMAGE_PROVIDERS.map((provider) => ({ label: provider, value: provider as string }))}
            value={selected}
          />
          <View className="flex-row items-center justify-between gap-3">
            <SourceTag item={providerSetting} />
            {providerSetting.source === 'db' ? (
              <WebButton
                disabled={saving}
                isLoading={saving}
                label="Reset"
                onPress={() => void onSave(workflow.providerKey, '')}
                size="sm"
                variant="outline"
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {selected === 'runninghub' ? (
        <View className="gap-3">
          <ImageModelsSection />
          <Text className="text-overline text-app-muted">RunningHub shared</Text>
          {rowsFor(RUNNINGHUB_SHARED_KEYS)}
        </View>
      ) : selected === 'openai' ? (
        <View className="gap-3">
          <Text className="text-body-sm text-app-muted">
            OpenAI image settings are shared across workflows that use OpenAI.
          </Text>
          {rowsFor(OPENAI_KEYS)}
        </View>
      ) : (
        <Text className="text-body-sm leading-6 text-app-muted">
          Mock provider returns placeholder/passthrough images — no extra configuration needed.
        </Text>
      )}
    </WebCard>
  );
}
