import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import type { AdminSettingItem } from '@/api/types';
import { Button } from '@/components/Button';
import { useAdminSettings } from '@/hooks/use-admin-settings';

import { AdminDropdown } from './AdminDropdown';
import { ImageGenJobsSection } from './ImageGenJobsSection';
import { ImageModelsSection } from './ImageModelsSection';
import { CreateWorkflowsRow, SettingRow, SourceTag } from './SettingsSection';
import type { RevealSettingFn, SaveSettingFn } from './SettingsSection';

const DEFAULT_PROVIDER_KEY = 'image_gen.provider';
const WF1_PROVIDER_KEY = 'image_gen.wf1_provider';
const WF2_PROVIDER_KEY = 'image_gen.wf2_provider';
const CREATE_WORKFLOWS_KEY = 'image_gen.create_workflows';

// Engines the backend can actually route to (see image-gen/index.ts).
const IMAGE_PROVIDERS = ['mock', 'runninghub', 'openai'] as const;

// RunningHub infra shared by WF1 + WF2 when either runs on runninghub.
const RUNNINGHUB_SHARED_KEYS = [
  'image_gen.runninghub_base_url',
  'image_gen.api_key',
  'image_gen.webhook_url',
  'image_gen.webhook_secret',
  'image_gen.public_base_url',
  'image_gen.r2_signing_key',
] as const;
const WF1_RUNNINGHUB_KEYS = [CREATE_WORKFLOWS_KEY] as const;
const WF2_RUNNINGHUB_KEYS = [
  'image_gen.wf2_workflow_id',
  'image_gen.wf2_load_image_node_id',
  'image_gen.wf2_prompt_node_id',
] as const;
const OPENAI_KEYS = [
  'image_gen.openai_api_key',
  'image_gen.openai_model',
  'image_gen.openai_image_size',
] as const;

const WORKFLOWS = [
  { id: 'wf1', label: 'WF1 — base portrait (create)' },
  { id: 'wf2', label: 'WF2 — expression variants (variation)' },
] as const;

type WorkflowId = (typeof WORKFLOWS)[number]['id'];

export function PortraitGenerationSection() {
  const { settings, isLoading, error, reveal, save } = useAdminSettings();
  const [workflow, setWorkflow] = useState<WorkflowId>('wf1');

  if (isLoading) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color="#1E6B52" />
      </View>
    );
  }

  const byKey = (key: string) => settings.find((item) => item.key === key) ?? null;
  // Live generation defaults to RunningHub; admins opt into OpenAI per workflow.
  const defaultProvider = byKey(DEFAULT_PROVIDER_KEY)?.value?.trim() || 'runninghub';

  return (
    <View className="gap-4">
      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-lg font-semibold text-app-text">Portrait generation</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Pick a workflow to edit. WF1 (create) and WF2 (variation) each choose their own engine and
          switch independently — only the selected one is shown.
        </Text>
        {error ? <Text className="mt-2 text-sm font-semibold text-app-danger">{error}</Text> : null}
        <View className="mt-4">
          <AdminDropdown
            labelForValue={(value) => WORKFLOWS.find((w) => w.id === value)?.label ?? WORKFLOWS[0].label}
            onChange={(value) => setWorkflow((value as WorkflowId) ?? workflow)}
            options={WORKFLOWS.map((w) => ({ label: w.label, value: w.id as string }))}
            value={workflow}
          />
        </View>
      </View>

      {workflow === 'wf1' ? (
        <WorkflowPanel
          byKey={byKey}
          defaultProvider={defaultProvider}
          onReveal={reveal}
          onSave={save}
          providerKey={WF1_PROVIDER_KEY}
          runninghubKeys={WF1_RUNNINGHUB_KEYS}
          settings={settings}
          title="WF1 — base portrait (create)"
        >
          {/* WF1 checkpoint catalog only matters for the RunningHub create flow. */}
          <ImageModelsSection />
        </WorkflowPanel>
      ) : (
        <WorkflowPanel
          byKey={byKey}
          defaultProvider={defaultProvider}
          onReveal={reveal}
          onSave={save}
          providerKey={WF2_PROVIDER_KEY}
          runninghubKeys={WF2_RUNNINGHUB_KEYS}
          settings={settings}
          title="WF2 — expression variants (variation)"
        />
      )}

      <ImageGenJobsSection />
    </View>
  );
}

function WorkflowPanel({
  byKey,
  children,
  defaultProvider,
  onReveal,
  onSave,
  providerKey,
  runninghubKeys,
  settings,
  title,
}: {
  byKey: (key: string) => AdminSettingItem | null;
  children?: ReactNode;
  defaultProvider: string;
  onReveal: RevealSettingFn;
  onSave: SaveSettingFn;
  providerKey: string;
  runninghubKeys: readonly string[];
  settings: AdminSettingItem[];
  title: string;
}) {
  const providerSetting = byKey(providerKey);
  const [saving, setSaving] = useState(false);
  // Empty per-workflow value falls back to the default provider (matches backend).
  const selected = providerSetting?.value?.trim() || defaultProvider;

  async function setProvider(provider: string) {
    if (!providerSetting || provider === (providerSetting.value?.trim() || '')) return;
    setSaving(true);
    try {
      await onSave(providerKey, provider);
    } finally {
      setSaving(false);
    }
  }

  const rowsFor = (keys: readonly string[]) =>
    keys
      .map((key) => byKey(key))
      .filter((item): item is AdminSettingItem => item != null)
      .map((item) =>
        item.key === CREATE_WORKFLOWS_KEY ? (
          <CreateWorkflowsRow key={item.key} item={item} onSave={onSave} />
        ) : (
          <SettingRow key={item.key} item={item} onReveal={onReveal} onSave={onSave} />
        ),
      );

  return (
    <View className="gap-4 rounded-lg border border-app-line bg-white p-5">
      <View>
        <Text className="text-base font-semibold text-app-text">{title}</Text>
        <Text className="mt-1 text-xs text-app-muted">
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
              <View className="w-24">
                <Button
                  disabled={saving}
                  isLoading={saving}
                  label="Reset"
                  onPress={() => void onSave(providerKey, '')}
                  variant="secondary"
                />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {selected === 'runninghub' ? (
        <View className="gap-3">
          {rowsFor(runninghubKeys)}
          {children}
          <Text className="text-xs font-semibold uppercase text-app-muted">RunningHub shared</Text>
          {rowsFor(RUNNINGHUB_SHARED_KEYS)}
        </View>
      ) : selected === 'openai' ? (
        <View className="gap-3">
          <Text className="text-xs text-app-muted">
            OpenAI image settings are shared across workflows that use OpenAI.
          </Text>
          {rowsFor(OPENAI_KEYS)}
        </View>
      ) : (
        <Text className="text-sm leading-6 text-app-muted">
          Mock provider returns placeholder/passthrough images — no extra configuration needed.
        </Text>
      )}
    </View>
  );
}
