import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { AdminSettingItem } from '@/api/types';
import { Button } from '@/components/Button';
import { useAdminSettings } from '@/hooks/use-admin-settings';

import { ImageModelsSection } from './ImageModelsSection';
import { CreateWorkflowsRow, SettingRow, SourceTag } from './SettingsSection';

const PROVIDER_KEY = 'image_gen.provider';
const CREATE_WORKFLOWS_KEY = 'image_gen.create_workflows';

const RUNNINGHUB_KEYS = [
  'image_gen.runninghub_base_url',
  'image_gen.api_key',
  'image_gen.webhook_url',
  'image_gen.webhook_secret',
  'image_gen.public_base_url',
  'image_gen.r2_signing_key',
  'image_gen.create_workflows',
  'image_gen.wf2_workflow_id',
  'image_gen.wf2_load_image_node_id',
  'image_gen.wf2_prompt_node_id',
] as const;

const IMAGE_PROVIDERS = ['mock', 'runninghub', 'openai', 'comfyui'] as const;

export function PortraitGenerationSection() {
  const { settings, isLoading, error, reveal, save } = useAdminSettings();
  const [savingProvider, setSavingProvider] = useState(false);

  const providerSetting = settings.find((item) => item.key === PROVIDER_KEY) ?? null;
  const selectedProvider = providerSetting?.value?.trim() || 'mock';
  const runningHubRows = useMemo(
    () =>
      RUNNINGHUB_KEYS.map((key) => settings.find((item) => item.key === key))
        .filter((item): item is AdminSettingItem => item != null),
    [settings],
  );

  async function setProvider(provider: string) {
    if (!providerSetting || provider === selectedProvider) return;
    setSavingProvider(true);
    try {
      await save(PROVIDER_KEY, provider);
    } finally {
      setSavingProvider(false);
    }
  }

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
        <Text className="text-lg font-semibold text-app-text">Portrait generation</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Manage image providers, API keys, WF1 create workflows, WF2 expression workflows, and selectable portrait models.
        </Text>
        {error ? <Text className="mt-2 text-sm font-semibold text-app-danger">{error}</Text> : null}
      </View>

      {providerSetting ? (
        <View className="gap-3 rounded-lg border border-app-line bg-white p-5">
          <Text className="text-base font-semibold text-app-text">Image provider</Text>
          <ProviderDropdown value={selectedProvider} onChange={(provider) => void setProvider(provider)} />
          <View className="flex-row items-center justify-between gap-3">
            <SourceTag item={providerSetting} />
            <View className="w-24">
              <Button
                disabled={savingProvider || providerSetting.source !== 'db'}
                isLoading={savingProvider}
                label="Reset"
                onPress={() => void save(PROVIDER_KEY, '')}
                variant="secondary"
              />
            </View>
          </View>
          {selectedProvider === 'openai' || selectedProvider === 'comfyui' ? (
            <Text className="text-sm leading-6 text-app-muted">
              This provider is reserved in the admin layout. Add registry settings before enabling live generation for it.
            </Text>
          ) : null}
        </View>
      ) : null}

      <ImageModelsSection />

      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-base font-semibold text-app-text">RunningHub and workflow nodes</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Current env/admin values are shown with source labels. WF1 controls creation; WF2 controls expression portrait variants.
        </Text>
        <View className="mt-4 gap-3">
          {runningHubRows.map((item) =>
            item.key === CREATE_WORKFLOWS_KEY ? (
              <CreateWorkflowsRow key={item.key} item={item} onSave={save} />
            ) : (
              <SettingRow key={item.key} item={item} onReveal={reveal} onSave={save} />
            ),
          )}
        </View>
      </View>
    </View>
  );
}

function ProviderDropdown({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className="relative">
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((current) => !current)}
        className="min-h-12 justify-center rounded-lg border border-app-line bg-white px-4"
      >
        <Text className="text-base font-semibold text-app-text">{value}</Text>
      </Pressable>
      {open ? (
        <View className="mt-2 overflow-hidden rounded-lg border border-app-line bg-white">
          {IMAGE_PROVIDERS.map((provider) => (
            <Pressable
              key={provider}
              accessibilityRole="button"
              onPress={() => {
                onChange(provider);
                setOpen(false);
              }}
              className={`border-b border-app-line px-4 py-3 last:border-b-0 ${
                provider === value ? 'bg-app-primarySoft' : 'bg-white'
              }`}
            >
              <Text className={`text-sm font-semibold ${provider === value ? 'text-app-primary' : 'text-app-text'}`}>
                {provider}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
