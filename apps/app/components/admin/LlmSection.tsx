import { type ReactNode, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type {
  AdminSettingItem,
  LlmConfigItem,
  LlmProvider,
  LlmTestInput,
  LlmTestResult,
  LlmUsageByTaskProvider,
  LlmUsageResponse,
  LlmUsageTotals,
  LlmUsageWindow,
} from '@/api/types';
import { WebButton, WebLoading } from '@/components/web/ui';
import { DEFAULT_LLM_MODELS, LLM_PROVIDERS } from '@/constants/llm';
import { useAdminLlm } from '@/hooks/use-admin-llm';
import { useAdminSettings } from '@/hooks/use-admin-settings';

import { AdminDropdown } from './AdminDropdown';
import { AdminPanel, AdminPanelHeader } from './AdminPanel';
import { SettingRow } from './SettingsSection';

const INPUT_CLASS =
  'min-h-9 rounded-lg border border-app-line bg-app-surface px-3 text-sm text-app-ink';

const USAGE_WINDOWS: LlmUsageWindow[] = ['today', '7d', '30d'];
const LLM_SECRET_KEYS: Partial<Record<LlmProvider, string>> = {
  deepseek: 'llm.deepseek_api_key',
  openai: 'llm.openai_api_key',
  doubao: 'llm.doubao_api_key',
  minimax: 'llm.minimax_api_key',
};

// Providers we actually have a registered API key for (the "integrated" set).
const INTEGRATED_LLM_PROVIDERS = Object.keys(LLM_SECRET_KEYS) as LlmProvider[];

export function LlmSection() {
  const {
    isLoadingConfig,
    isLoadingUsage,
    isTesting,
    loadUsage,
    runTest,
    saveConfig,
    savingTask,
    tasks,
    testResult,
    usage,
    usageWindow,
  } = useAdminLlm();
  const {
    error: settingsError,
    isLoading: isLoadingSettings,
    reveal,
    save,
    settings,
  } = useAdminSettings();

  if (isLoadingConfig || isLoadingSettings) {
    return (
      <View className="items-center py-12">
        <WebLoading fullscreen={false} label="Loading..." />
      </View>
    );
  }

  return (
    <View className="gap-3">
      <AdminPanel>
        <AdminPanelHeader
          error={settingsError}
          subtitle="Model routing for companion conversations and related LLM tasks. Provider keys live in environment secrets."
          title="Companion chat models"
        />
      </AdminPanel>
      <ProviderPanel
        onReveal={reveal}
        onSave={save}
        providerModels={buildProviderModels(tasks)}
        saveConfig={saveConfig}
        savingTask={savingTask}
        settings={settings}
        tasks={tasks}
      />
      <TestPanel
        isTesting={isTesting}
        providerModels={buildProviderModels(tasks)}
        result={testResult}
        runTest={runTest}
        tasks={tasks}
      />
      <UsagePanel
        isLoading={isLoadingUsage}
        loadUsage={loadUsage}
        usage={usage}
        usageWindow={usageWindow}
      />
    </View>
  );
}

// -----------------------------------------------------------------------------
// Provider panel: pick a provider → key status, integrated models, and routed tasks.
// -----------------------------------------------------------------------------

function ProviderPanel({
  onReveal,
  onSave,
  providerModels,
  saveConfig,
  savingTask,
  settings,
  tasks,
}: {
  onReveal: (key: string) => Promise<{ value: string | null }>;
  onSave: (key: string, value: string, confirm?: string) => Promise<void>;
  providerModels: Record<LlmProvider, string[]>;
  saveConfig: (task: string, input: { provider: LlmProvider; model: string; fallback_provider: LlmProvider | null; fallback_model: string | null }) => Promise<boolean>;
  savingTask: string | null;
  settings: AdminSettingItem[];
  tasks: LlmConfigItem[];
}) {
  // Providers offered: integrated ones (have a registered key) plus any that
  // already own a task, so no existing routing row is ever hidden.
  const providers = unique([
    ...INTEGRATED_LLM_PROVIDERS,
    ...tasks.map((task) => task.provider),
  ]) as LlmProvider[];
  const [selected, setSelected] = useState<LlmProvider>(providers[0] ?? 'deepseek');
  const [editingTask, setEditingTask] = useState<string | null>(null);

  const secretKey = LLM_SECRET_KEYS[selected];
  const secretItem = secretKey ? settings.find((row) => row.key === secretKey) ?? null : null;
  const models = providerModels[selected] ?? [];
  const providerTasks = tasks.filter((task) => task.provider === selected);

  return (
    <AdminPanel>
      <AdminPanelHeader
        subtitle="Pick a provider to check its key status, see its integrated models, and route tasks to it."
        title="Provider"
      />

      <AdminDropdown
        labelForValue={(value) => value ?? 'Select provider'}
        onChange={(value) => {
          setSelected(value ?? selected);
          setEditingTask(null);
        }}
        options={providers.map((provider) => ({ label: provider, value: provider }))}
        value={selected}
      />

      <View className="gap-4">
        <View className="gap-1.5">
          <Text className="text-xs font-semibold uppercase text-app-muted">API key status</Text>
          {secretItem ? (
            <SettingRow item={secretItem} onReveal={onReveal} onSave={onSave} />
          ) : (
            <Text className="rounded-xl border border-app-line bg-app-sunken/60 p-4 text-xs text-app-muted">
              No API key setting is registered for this provider yet.
            </Text>
          )}
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-semibold uppercase text-app-muted">Integrated models</Text>
          {models.length === 0 ? (
            <Text className="text-sm text-app-muted">No models recorded for this provider.</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {models.map((model) => (
                <View key={model} className="rounded-full border border-app-line bg-app-canvas px-3 py-1">
                  <Text className="text-xs font-semibold text-app-ink">{model}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-semibold uppercase text-app-muted">Tasks routed here</Text>
          {providerTasks.length === 0 ? (
            <Text className="text-sm text-app-muted">No tasks currently use {selected}.</Text>
          ) : (
            <View className="gap-3">
              {providerTasks.map((row) =>
                editingTask === row.task ? (
                  <ConfigEditor
                    key={row.task}
                    isSaving={savingTask === row.task}
                    onCancel={() => setEditingTask(null)}
                    onSave={async (input) => {
                      const ok = await saveConfig(row.task, input);
                      if (ok) setEditingTask(null);
                    }}
                    providerModels={providerModels}
                    row={row}
                  />
                ) : (
                  <ConfigRow key={row.task} onEdit={() => setEditingTask(row.task)} row={row} />
                ),
              )}
            </View>
          )}
        </View>
      </View>
    </AdminPanel>
  );
}

function ConfigRow({ onEdit, row }: { onEdit: () => void; row: LlmConfigItem }) {
  return (
    <View className="rounded-lg border border-app-line bg-app-sunken/60 p-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-app-ink">{row.task}</Text>
          <Text className="mt-0.5 text-xs text-app-muted">
            {row.provider} · {row.model}
          </Text>
          {row.fallback_provider ? (
            <Text className="mt-0.5 text-xs text-app-muted">
              fallback: {row.fallback_provider} · {row.fallback_model}
            </Text>
          ) : null}
          {row.updated_by ? (
            <Text className="mt-0.5 text-xs text-app-muted">updated by {row.updated_by}</Text>
          ) : null}
        </View>
        <View className="w-20">
          <WebButton label="Edit" onPress={onEdit} size="sm" variant="secondary" />
        </View>
      </View>
    </View>
  );
}

function ConfigEditor({
  isSaving,
  onCancel,
  onSave,
  providerModels,
  row,
}: {
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: { provider: LlmProvider; model: string; fallback_provider: LlmProvider | null; fallback_model: string | null }) => void;
  providerModels: Record<LlmProvider, string[]>;
  row: LlmConfigItem;
}) {
  const [provider, setProvider] = useState<LlmProvider>(row.provider);
  const [model, setModel] = useState(row.model);
  const [fallbackProvider, setFallbackProvider] = useState<LlmProvider | null>(row.fallback_provider);
  const [fallbackModel, setFallbackModel] = useState(row.fallback_model ?? '');

  function handleSave() {
    const hasFallback = fallbackProvider !== null && fallbackModel.trim() !== '';
    onSave({
      provider,
      model: model.trim(),
      fallback_provider: hasFallback ? fallbackProvider : null,
      fallback_model: hasFallback ? fallbackModel.trim() : null,
    });
  }

  return (
    <View className="rounded-lg border border-app-rose bg-app-rose-soft p-3">
      <Text className="text-sm font-semibold text-app-ink">{row.task}</Text>
      <View className="mt-3 gap-3">
        <Field label="Provider">
          <ProviderPicker onChange={(p) => setProvider(p ?? provider)} value={provider} />
        </Field>
        <Field label="Model">
          <ModelPicker models={providerModels[provider]} onChange={setModel} value={model} />
        </Field>
        <Field label="Fallback provider (optional)">
          <ProviderPicker allowNone onChange={setFallbackProvider} value={fallbackProvider} />
        </Field>
        {fallbackProvider ? (
          <Field label="Fallback model">
            <ModelPicker
              models={providerModels[fallbackProvider]}
              onChange={setFallbackModel}
              value={fallbackModel}
            />
          </Field>
        ) : null}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <WebButton label="Cancel" onPress={onCancel} size="sm" variant="secondary" />
          </View>
          <View className="flex-1">
            <WebButton isLoading={isSaving} label="Save" onPress={handleSave} size="sm" />
          </View>
        </View>
      </View>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Test
// -----------------------------------------------------------------------------

function TestPanel({
  isTesting,
  providerModels,
  result,
  runTest,
  tasks,
}: {
  isTesting: boolean;
  providerModels: Record<LlmProvider, string[]>;
  result: LlmTestResult | null;
  runTest: (input: LlmTestInput) => void;
  tasks: LlmConfigItem[];
}) {
  const [task, setTask] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [overrideProvider, setOverrideProvider] = useState<LlmProvider | null>(null);
  const [overrideModel, setOverrideModel] = useState('');

  const activeTask = task ?? tasks[0]?.task ?? null;

  function handleRun() {
    if (!activeTask) return;
    const useOverride = overrideProvider !== null && overrideModel.trim() !== '';
    runTest({
      task: activeTask,
      prompt,
      ...(useOverride ? { provider: overrideProvider, model: overrideModel.trim() } : {}),
    });
  }

  return (
    <AdminPanel>
      <AdminPanelHeader
        subtitle="Sends a one-off prompt. Leave the override as Default to use the task's configured provider."
        title="Test call"
      />
      <View className="gap-3">
        <Field label="Task">
          <AdminDropdown
            labelForValue={(value) => value ?? 'Select task'}
            onChange={(value) => setTask(value)}
            options={tasks.map((row) => ({ label: row.task, value: row.task }))}
            value={activeTask}
          />
        </Field>
        <Field label="Prompt">
          <TextInput
            multiline
            onChangeText={setPrompt}
            placeholder="Say hello"
            placeholderTextColor="#8B949E"
            value={prompt}
            className="min-h-20 rounded-lg border border-app-line bg-app-surface px-3 py-2 text-sm text-app-ink"
          />
        </Field>
        <Field label="Override provider (optional)">
          <ProviderPicker allowNone onChange={setOverrideProvider} value={overrideProvider} />
        </Field>
        {overrideProvider ? (
          <Field label="Override model">
            <ModelPicker
              models={providerModels[overrideProvider]}
              onChange={setOverrideModel}
              value={overrideModel}
            />
          </Field>
        ) : null}
        <WebButton disabled={!activeTask} isLoading={isTesting} label="Run test" onPress={handleRun} size="sm" />
      </View>

      {result ? <TestResult result={result} /> : null}
    </AdminPanel>
  );
}

function TestResult({ result }: { result: LlmTestResult }) {
  if (result.ok) {
    return (
      <View className="mt-4 rounded-xl border border-app-line bg-app-sunken/60 p-4">
        <Text className="text-xs font-semibold uppercase text-app-rose-deep">Success</Text>
        <Text className="mt-1 text-xs text-app-muted">
          {result.provider} · {result.model} · {result.tokens.input}/{result.tokens.output} tok · $
          {result.cost_usd.toFixed(4)} · {result.latency_ms}ms
        </Text>
        <Text className="mt-2 text-sm text-app-ink">{result.text}</Text>
      </View>
    );
  }
  return (
    <View className="mt-4 rounded-lg border border-app-danger bg-app-canvas p-4">
      <Text className="text-xs font-semibold uppercase text-app-rose-deep">{result.error_code}</Text>
      <Text className="mt-1 text-xs text-app-muted">
        {result.provider} · {result.model} · {result.latency_ms}ms
      </Text>
      <Text className="mt-2 text-sm text-app-ink">{result.error_message}</Text>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Usage
// -----------------------------------------------------------------------------

function UsagePanel({
  isLoading,
  loadUsage,
  usage,
  usageWindow,
}: {
  isLoading: boolean;
  loadUsage: (window: LlmUsageWindow) => void;
  usage: LlmUsageResponse | null;
  usageWindow: LlmUsageWindow;
}) {
  return (
    <AdminPanel>
      <AdminPanelHeader title="Usage" />
      <View className="flex-row gap-2">
        {USAGE_WINDOWS.map((window) => (
          <Chip
            key={window}
            active={usageWindow === window}
            label={window}
            onPress={() => loadUsage(window)}
          />
        ))}
      </View>

      {isLoading || !usage ? (
        <Text className="text-sm text-app-muted">Loading usage...</Text>
      ) : (
        <View className="gap-4">
          <TotalsRow totals={usage.totals} />
          <View className="gap-2">
            <Text className="text-sm font-semibold text-app-ink">By task · provider</Text>
            {usage.by_task_provider.length === 0 ? (
              <Text className="text-sm text-app-muted">No calls in this window.</Text>
            ) : (
              usage.by_task_provider.map((row) => <UsageRow key={`${row.task}:${row.provider}`} row={row} />)
            )}
          </View>
        </View>
      )}
    </AdminPanel>
  );
}

function TotalsRow({ totals }: { totals: LlmUsageTotals }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      <Stat label="Calls" value={String(totals.calls)} />
      <Stat label="Errors" value={String(totals.error_calls)} />
      <Stat label="In tok" value={String(totals.token_input)} />
      <Stat label="Out tok" value={String(totals.token_output)} />
      <Stat label="Cost" value={`$${totals.cost_usd.toFixed(4)}`} />
    </View>
  );
}

function UsageRow({ row }: { row: LlmUsageByTaskProvider }) {
  return (
    <View className="border-b border-app-line py-2 last:border-b-0">
      <Text className="text-sm font-semibold text-app-ink">
        {row.task} · {row.provider}
      </Text>
      <Text className="mt-0.5 text-xs text-app-muted">
        {row.calls} calls · {row.error_calls} err · {row.token_input}/{row.token_output} tok · $
        {row.cost_usd.toFixed(4)}
      </Text>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Shared bits
// -----------------------------------------------------------------------------

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-semibold uppercase text-app-muted">{label}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-20 flex-1 rounded-xl border border-app-line bg-app-sunken/60 p-3">
      <Text className="text-xs uppercase text-app-muted">{label}</Text>
      <Text className="mt-1 text-base font-semibold text-app-ink">{value}</Text>
    </View>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-9 items-center justify-center rounded-full border px-3 ${
        active ? 'border-app-rose/70 bg-app-canvas/70' : 'border-app-line bg-app-surface'
      }`}
    >
      <Text className={`text-xs font-semibold ${active ? 'text-app-rose-deep' : 'text-app-muted'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProviderPicker({
  allowNone = false,
  onChange,
  value,
}: {
  allowNone?: boolean;
  onChange: (provider: LlmProvider | null) => void;
  value: LlmProvider | null;
}) {
  const options: { label: string; value: LlmProvider | null }[] = [
    ...(allowNone ? [{ label: 'Default', value: null as LlmProvider | null }] : []),
    ...LLM_PROVIDERS.map((provider) => ({ label: provider, value: provider as LlmProvider })),
  ];
  return (
    <AdminDropdown
      labelForValue={(next) => options.find((option) => option.value === next)?.label ?? 'Default'}
      onChange={onChange}
      options={options}
      value={value}
    />
  );
}

function ModelPicker({
  models,
  onChange,
  value,
}: {
  models: string[];
  onChange: (model: string) => void;
  value: string;
}) {
  const options = unique([value, ...models].filter((model) => model.trim() !== '')).map((model) => ({
    label: model,
    value: model,
  }));
  if (options.length === 0) {
    return (
      <TextInput
        autoCapitalize="none"
        onChangeText={onChange}
        placeholder="model id"
        placeholderTextColor="#8B949E"
        value={value}
        className={INPUT_CLASS}
      />
    );
  }
  return (
    <View className="gap-2">
      <AdminDropdown
        labelForValue={(next) => next || 'Select model'}
        onChange={onChange}
        options={options}
        value={value}
      />
      <TextInput
        autoCapitalize="none"
        onChangeText={onChange}
        placeholder="custom model id"
        placeholderTextColor="#8B949E"
        value={value}
        className={INPUT_CLASS}
      />
    </View>
  );
}

function buildProviderModels(tasks: LlmConfigItem[]): Record<LlmProvider, string[]> {
  const out = Object.fromEntries(LLM_PROVIDERS.map((provider) => [provider, [...(DEFAULT_LLM_MODELS[provider] ?? [])]])) as Record<
    LlmProvider,
    string[]
  >;
  for (const task of tasks) {
    out[task.provider].push(task.model);
    if (task.fallback_provider && task.fallback_model) out[task.fallback_provider].push(task.fallback_model);
  }
  return Object.fromEntries(
    LLM_PROVIDERS.map((provider) => [provider, unique(out[provider])]),
  ) as Record<LlmProvider, string[]>;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
