import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

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
import { Button } from '@/components/Button';
import { LLM_PROVIDERS } from '@/constants/llm';
import { useAdminLlm } from '@/hooks/use-admin-llm';
import { useAdminSettings } from '@/hooks/use-admin-settings';

import { SettingRow } from './SettingsSection';

const INPUT_CLASS =
  'min-h-12 rounded-lg border border-app-line bg-white px-4 text-base text-app-text';

const USAGE_WINDOWS: LlmUsageWindow[] = ['today', '7d', '30d'];
const LLM_SECRET_KEYS: Partial<Record<LlmProvider, string>> = {
  deepseek: 'llm.deepseek_api_key',
  openai: 'llm.openai_api_key',
};

const DEFAULT_MODELS: Partial<Record<LlmProvider, string[]>> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-5-mini'],
};

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
        <ActivityIndicator color="#1E6B52" />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-lg font-semibold text-app-text">Companion chat models</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Manage provider keys and model routing used by companion conversations and related LLM tasks.
        </Text>
        {settingsError ? <Text className="mt-2 text-sm font-semibold text-app-danger">{settingsError}</Text> : null}
      </View>
      <LlmSecretsPanel onReveal={reveal} onSave={save} settings={settings} />
      <ConfigPanel providerModels={buildProviderModels(tasks)} saveConfig={saveConfig} savingTask={savingTask} tasks={tasks} />
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
// Config
// -----------------------------------------------------------------------------

function ConfigPanel({
  providerModels,
  saveConfig,
  savingTask,
  tasks,
}: {
  providerModels: Record<LlmProvider, string[]>;
  saveConfig: (task: string, input: { provider: LlmProvider; model: string; fallback_provider: LlmProvider | null; fallback_model: string | null }) => Promise<boolean>;
  savingTask: string | null;
  tasks: LlmConfigItem[];
}) {
  const [editingTask, setEditingTask] = useState<string | null>(null);

  return (
    <View className="rounded-lg border border-app-line bg-white p-5">
      <Text className="text-lg font-semibold text-app-text">LLM routing</Text>
      <Text className="mt-1 text-sm leading-6 text-app-muted">
        Provider and model per task, with an optional fallback.
      </Text>
      <View className="mt-4 gap-3">
        {tasks.map((row) =>
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
    </View>
  );
}

function ConfigRow({ onEdit, row }: { onEdit: () => void; row: LlmConfigItem }) {
  return (
    <View className="rounded-lg border border-app-line bg-app-bg p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold text-app-text">{row.task}</Text>
          <Text className="mt-1 text-sm text-app-muted">
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
        <View className="w-24">
          <Button label="Edit" onPress={onEdit} variant="secondary" />
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
    <View className="rounded-lg border border-app-primary bg-app-bg p-4">
      <Text className="text-base font-semibold text-app-text">{row.task}</Text>
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
            <Button label="Cancel" onPress={onCancel} variant="secondary" />
          </View>
          <View className="flex-1">
            <Button isLoading={isSaving} label="Save" onPress={handleSave} />
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
    <View className="rounded-lg border border-app-line bg-white p-5">
      <Text className="text-lg font-semibold text-app-text">Test call</Text>
      <Text className="mt-1 text-sm leading-6 text-app-muted">
        Sends a one-off prompt. Leave the override as Default to use the task&apos;s configured provider.
      </Text>
      <View className="mt-4 gap-3">
        <Field label="Task">
          <View className="flex-row flex-wrap gap-2">
            {tasks.map((row) => (
              <Chip
                key={row.task}
                active={activeTask === row.task}
                label={row.task}
                onPress={() => setTask(row.task)}
              />
            ))}
          </View>
        </Field>
        <Field label="Prompt">
          <TextInput
            multiline
            onChangeText={setPrompt}
            placeholder="Say hello"
            placeholderTextColor="#8B949E"
            value={prompt}
            className="min-h-24 rounded-lg border border-app-line bg-white px-4 py-3 text-base text-app-text"
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
        <Button disabled={!activeTask} isLoading={isTesting} label="Run test" onPress={handleRun} />
      </View>

      {result ? <TestResult result={result} /> : null}
    </View>
  );
}

function TestResult({ result }: { result: LlmTestResult }) {
  if (result.ok) {
    return (
      <View className="mt-4 rounded-lg border border-app-line bg-app-bg p-4">
        <Text className="text-xs font-semibold uppercase text-app-primary">Success</Text>
        <Text className="mt-1 text-xs text-app-muted">
          {result.provider} · {result.model} · {result.tokens.input}/{result.tokens.output} tok · $
          {result.cost_usd.toFixed(4)} · {result.latency_ms}ms
        </Text>
        <Text className="mt-2 text-sm text-app-text">{result.text}</Text>
      </View>
    );
  }
  return (
    <View className="mt-4 rounded-lg border border-app-danger bg-app-bg p-4">
      <Text className="text-xs font-semibold uppercase text-app-danger">{result.error_code}</Text>
      <Text className="mt-1 text-xs text-app-muted">
        {result.provider} · {result.model} · {result.latency_ms}ms
      </Text>
      <Text className="mt-2 text-sm text-app-text">{result.error_message}</Text>
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
    <View className="rounded-lg border border-app-line bg-white p-5">
      <Text className="text-lg font-semibold text-app-text">Usage</Text>
      <View className="mt-3 flex-row gap-2">
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
        <Text className="mt-4 text-sm text-app-muted">Loading usage...</Text>
      ) : (
        <View className="mt-4 gap-4">
          <TotalsRow totals={usage.totals} />
          <View className="gap-2">
            <Text className="text-sm font-semibold text-app-text">By task · provider</Text>
            {usage.by_task_provider.length === 0 ? (
              <Text className="text-sm text-app-muted">No calls in this window.</Text>
            ) : (
              usage.by_task_provider.map((row) => <UsageRow key={`${row.task}:${row.provider}`} row={row} />)
            )}
          </View>
        </View>
      )}
    </View>
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
      <Text className="text-sm font-semibold text-app-text">
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

function LlmSecretsPanel({
  onReveal,
  onSave,
  settings,
}: {
  onReveal: (key: string) => Promise<{ value: string | null }>;
  onSave: (key: string, value: string, confirm?: string) => Promise<void>;
  settings: AdminSettingItem[];
}) {
  return (
    <View className="rounded-lg border border-app-line bg-white p-5">
      <Text className="text-base font-semibold text-app-text">Provider API keys</Text>
      <Text className="mt-1 text-sm leading-6 text-app-muted">
        Admins can verify which providers have keys. Values stay masked until revealed.
      </Text>
      <View className="mt-4 gap-3">
        {LLM_PROVIDERS.map((provider) => {
          const key = LLM_SECRET_KEYS[provider];
          const item = key ? settings.find((row) => row.key === key) : null;
          if (!item) {
            return <ProviderMissingKey key={provider} provider={provider} />;
          }
          return <SettingRow key={item.key} item={item} onReveal={onReveal} onSave={onSave} />;
        })}
      </View>
    </View>
  );
}

function ProviderMissingKey({ provider }: { provider: LlmProvider }) {
  return (
    <View className="rounded-lg border border-app-line bg-app-bg p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-app-text">{provider}</Text>
          <Text className="mt-1 text-xs text-app-muted">No API key setting is registered for this provider yet.</Text>
        </View>
        <Text className="rounded-full border border-app-danger px-3 py-1 text-xs font-semibold text-app-danger">
          missing
        </Text>
      </View>
    </View>
  );
}

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
    <View className="min-w-20 flex-1 rounded-lg border border-app-line bg-app-bg p-3">
      <Text className="text-xs uppercase text-app-muted">{label}</Text>
      <Text className="mt-1 text-base font-semibold text-app-text">{value}</Text>
    </View>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-9 items-center justify-center rounded-full border px-3 ${
        active ? 'border-app-primary bg-app-primarySoft' : 'border-app-line bg-white'
      }`}
    >
      <Text className={`text-xs font-semibold ${active ? 'text-app-primary' : 'text-app-muted'}`}>
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
  const options: Array<{ label: string; value: LlmProvider | null }> = [
    ...(allowNone ? [{ label: 'Default', value: null as LlmProvider | null }] : []),
    ...LLM_PROVIDERS.map((provider) => ({ label: provider, value: provider as LlmProvider })),
  ];
  return (
    <Dropdown
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
      <Dropdown
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

function Dropdown<T extends string | null>({
  labelForValue,
  onChange,
  options,
  value,
}: {
  labelForValue: (value: T) => string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((current) => !current)}
        className="min-h-12 justify-center rounded-lg border border-app-line bg-white px-4"
      >
        <Text className="text-base font-semibold text-app-text">{labelForValue(value)}</Text>
      </Pressable>
      {open ? (
        <View className="mt-2 overflow-hidden rounded-lg border border-app-line bg-white">
          {options.map((option) => (
            <Pressable
              key={option.value ?? 'none'}
              accessibilityRole="button"
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`border-b border-app-line px-4 py-3 last:border-b-0 ${
                option.value === value ? 'bg-app-primarySoft' : 'bg-white'
              }`}
            >
              <Text className={`text-sm font-semibold ${option.value === value ? 'text-app-primary' : 'text-app-text'}`}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function buildProviderModels(tasks: LlmConfigItem[]): Record<LlmProvider, string[]> {
  const out = Object.fromEntries(LLM_PROVIDERS.map((provider) => [provider, [...(DEFAULT_MODELS[provider] ?? [])]])) as Record<
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
