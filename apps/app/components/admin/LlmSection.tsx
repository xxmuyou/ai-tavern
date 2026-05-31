import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import type {
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

const INPUT_CLASS =
  'min-h-12 rounded-lg border border-app-line bg-white px-4 text-base text-app-text';

const USAGE_WINDOWS: LlmUsageWindow[] = ['today', '7d', '30d'];

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

  if (isLoadingConfig) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color="#1E6B52" />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <ConfigPanel saveConfig={saveConfig} savingTask={savingTask} tasks={tasks} />
      <TestPanel isTesting={isTesting} result={testResult} runTest={runTest} tasks={tasks} />
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
  saveConfig,
  savingTask,
  tasks,
}: {
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
  row,
}: {
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: { provider: LlmProvider; model: string; fallback_provider: LlmProvider | null; fallback_model: string | null }) => void;
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
          <TextInput
            autoCapitalize="none"
            onChangeText={setModel}
            placeholder="model id"
            placeholderTextColor="#8B949E"
            value={model}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Fallback provider (optional)">
          <ProviderPicker allowNone onChange={setFallbackProvider} value={fallbackProvider} />
        </Field>
        {fallbackProvider ? (
          <Field label="Fallback model">
            <TextInput
              autoCapitalize="none"
              onChangeText={setFallbackModel}
              placeholder="model id"
              placeholderTextColor="#8B949E"
              value={fallbackModel}
              className={INPUT_CLASS}
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
  result,
  runTest,
  tasks,
}: {
  isTesting: boolean;
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
            <TextInput
              autoCapitalize="none"
              onChangeText={setOverrideModel}
              placeholder="model id"
              placeholderTextColor="#8B949E"
              value={overrideModel}
              className={INPUT_CLASS}
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
  return (
    <View className="flex-row flex-wrap gap-2">
      {allowNone ? (
        <Chip active={value === null} label="Default" onPress={() => onChange(null)} />
      ) : null}
      {LLM_PROVIDERS.map((provider) => (
        <Chip
          key={provider}
          active={value === provider}
          label={provider}
          onPress={() => onChange(provider)}
        />
      ))}
    </View>
  );
}
