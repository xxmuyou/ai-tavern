import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import type { AdminSettingItem } from '@/api/types';
import { Button } from '@/components/Button';
import { useAdminSettings } from '@/hooks/use-admin-settings';

import { AdminDropdown } from './AdminDropdown';

const GROUP_LABELS: Record<string, string> = {
  auth: 'Google / Auth / OAuth / CORS',
  billing: 'Stripe billing',
  limits: 'Rate limits',
  email: 'Email',
};

const INPUT_CLASS = 'min-h-12 rounded-lg border border-app-line bg-white px-4 text-base text-app-text';

export type SaveSettingFn = (key: string, value: string, confirm?: string) => Promise<void>;
export type RevealSettingFn = (key: string) => Promise<{ value: string | null }>;

export function SettingsSection() {
  const { settings, groups, isLoading, error, reveal, save } = useAdminSettings();
  const visibleGroups = useMemo(
    () => groups.filter((group) => group !== 'llm' && group !== 'image_gen' && settings.some((s) => s.group === group)),
    [groups, settings],
  );
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  if (isLoading) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color="#1E6B52" />
      </View>
    );
  }

  const activeGroup = selectedGroup && visibleGroups.includes(selectedGroup) ? selectedGroup : visibleGroups[0] ?? null;
  const rows = activeGroup ? settings.filter((s) => s.group === activeGroup) : [];

  return (
    <View className="gap-4">
      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-lg font-semibold text-app-text">Operational settings</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Pick a module to configure it. Saved values take effect within ~30s, no redeploy. Empty a field to fall back to the env default. This is per-environment.
        </Text>
        {error ? <Text className="mt-2 text-sm font-semibold text-app-danger">{error}</Text> : null}
        {visibleGroups.length > 0 ? (
          <View className="mt-4">
            <AdminDropdown
              labelForValue={(value) => (value ? GROUP_LABELS[value] ?? value : 'Select module')}
              onChange={(value) => setSelectedGroup(value)}
              options={visibleGroups.map((group) => ({ label: GROUP_LABELS[group] ?? group, value: group }))}
              value={activeGroup}
            />
          </View>
        ) : null}
      </View>

      {activeGroup && rows.length > 0 ? (
        <View className="rounded-lg border border-app-line bg-white p-5">
          <Text className="text-base font-semibold text-app-text">{GROUP_LABELS[activeGroup] ?? activeGroup}</Text>
          <View className="mt-3 gap-3">
            {rows.map((item) => (
              <SettingRow key={item.key} item={item} onReveal={reveal} onSave={save} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function SourceTag({ item }: { item: AdminSettingItem }) {
  const label = item.admin_mode === 'status_only'
    ? 'env managed'
    : item.source === 'db'
      ? 'admin'
      : item.source === 'env'
        ? 'env default'
        : item.source === 'derived'
          ? 'derived (APP_BASE_URL)'
          : 'unset';
  return <Text className="text-xs text-app-muted">source: {label}{item.updated_by ? ` · ${item.updated_by}` : ''}</Text>;
}

export function SettingRow({
  item,
  onReveal,
  onSave,
}: {
  item: AdminSettingItem;
  onReveal?: RevealSettingFn;
  onSave: SaveSettingFn;
}) {
  const isSecret = item.type === 'secret';
  const isBoolean = item.type === 'boolean';
  const isDangerous = item.danger_level === 'high';
  const [draft, setDraft] = useState(isSecret ? '' : item.value ?? '');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [showRevealed, setShowRevealed] = useState(false);

  useEffect(() => {
    if (!isSecret) setDraft(item.value ?? '');
  }, [item.value, isSecret]);

  if (item.admin_mode === 'status_only') {
    return <StatusOnlySettingRow item={item} />;
  }

  async function run(value: string) {
    setBusy(true);
    try {
      await onSave(item.key, value, isDangerous ? confirm.trim() : undefined);
      if (isSecret) setDraft('');
      setConfirm('');
      setRevealed(null);
      setShowRevealed(false);
    } finally {
      setBusy(false);
    }
  }

  async function toggleReveal() {
    if (!onReveal || !isSecret) return;
    if (showRevealed) {
      setShowRevealed(false);
      return;
    }
    setIsRevealing(true);
    try {
      const result = await onReveal(item.key);
      setRevealed(result.value ?? '');
      setShowRevealed(true);
    } finally {
      setIsRevealing(false);
    }
  }

  if (isBoolean) {
    const on = (item.value ?? 'false') === 'true';
    return (
      <View className="gap-1 rounded-lg border border-app-line bg-app-bg p-4">
        <RowHeader item={item} />
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <SourceTag item={item} />
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void run(on ? 'false' : 'true')}
            className={`rounded-full border px-3 py-2 ${on ? 'border-app-primary bg-app-primary' : 'border-app-line bg-white'}`}
          >
            <Text className={`text-sm font-semibold ${on ? 'text-white' : 'text-app-muted'}`}>{on ? 'On' : 'Off'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-2 rounded-lg border border-app-line bg-app-bg p-4">
      <RowHeader item={item} />
      <TextInput
        className={INPUT_CLASS}
        keyboardType={item.type === 'number' ? 'number-pad' : 'default'}
        onChangeText={setDraft}
        placeholder={isSecret ? (item.is_set ? '•••••• set — type to replace' : 'not set') : 'value'}
        placeholderTextColor="#687076"
        secureTextEntry={isSecret}
        value={draft}
      />
      {isSecret ? (
        <View className="gap-2 rounded-lg border border-app-line bg-white p-3">
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-xs font-semibold uppercase text-app-muted">Current secret</Text>
              <Text numberOfLines={1} className="mt-1 font-mono text-sm text-app-text">
                {showRevealed ? revealed || '(empty)' : item.is_set ? '****' : 'missing'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={!onReveal || isRevealing || !item.is_set}
              onPress={() => void toggleReveal()}
              className={`rounded-full border px-3 py-2 ${
                showRevealed ? 'border-app-primary bg-app-primarySoft' : 'border-app-line bg-app-bg'
              } ${!item.is_set ? 'opacity-50' : ''}`}
            >
              <Text className="text-xs font-semibold text-app-primary">
                {showRevealed ? 'Hide' : isRevealing ? 'Loading' : 'View'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {isDangerous ? (
        <View>
          <Text className="mb-1 text-xs font-semibold text-app-danger">Confirm by typing the setting key</Text>
          <TextInput
            className={INPUT_CLASS}
            onChangeText={setConfirm}
            placeholder={item.key}
            placeholderTextColor="#687076"
            value={confirm}
          />
        </View>
      ) : null}
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <SourceTag item={item} />
        </View>
        <View className="flex-row gap-2">
          {item.source === 'db' ? (
            <View className="w-24">
              <Button disabled={busy || (isDangerous && confirm.trim() !== item.key)} label="Reset" onPress={() => void run('')} variant="secondary" />
            </View>
          ) : null}
          <View className="w-24">
            <Button disabled={busy || (isSecret ? draft.trim() === '' : draft === (item.value ?? '')) || (isDangerous && confirm.trim() !== item.key)} isLoading={busy} label="Save" onPress={() => void run(draft)} />
          </View>
        </View>
      </View>
    </View>
  );
}

function StatusOnlySettingRow({ item }: { item: AdminSettingItem }) {
  return (
    <View className="gap-2 rounded-lg border border-app-line bg-app-bg p-4 opacity-75">
      <RowHeader item={item} />
      <View className="flex-row items-center justify-between gap-3 rounded-lg border border-app-line bg-white p-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold uppercase text-app-muted">Environment status</Text>
          <Text className="mt-1 text-sm font-semibold text-app-text">
            {item.is_set ? 'Configured' : 'Missing'}
          </Text>
        </View>
        <View className={`rounded-full border px-3 py-1.5 ${item.is_set ? 'border-app-primary bg-app-primarySoft' : 'border-app-line bg-app-bg'}`}>
          <Text className={`text-xs font-semibold ${item.is_set ? 'text-app-primary' : 'text-app-muted'}`}>
            {item.is_set ? 'Set' : 'Unset'}
          </Text>
        </View>
      </View>
      <SourceTag item={item} />
    </View>
  );
}

export function RowHeader({ item }: { item: AdminSettingItem }) {
  return (
    <View>
      <Text className="text-sm font-semibold text-app-text">{item.label}</Text>
      <Text className="text-xs text-app-muted">{item.env_key ? `${item.env_key} · ` : ''}{item.key}</Text>
      {item.description ? <Text className="text-xs text-app-muted">{item.description}</Text> : null}
      {item.admin_mode === 'status_only' ? <Text className="text-xs font-semibold text-app-muted">Managed in environment secrets; value is not viewable or editable here.</Text> : null}
      {item.danger_level === 'high' ? <Text className="text-xs font-semibold text-app-danger">High-risk runtime setting</Text> : null}
    </View>
  );
}
