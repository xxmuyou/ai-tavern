import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { AdminSettingItem } from '@/api/types';
import { WebButton, WebInput, WebLoading, WebTag } from '@/components/web/ui';
import { useAdminSettings } from '@/hooks/use-admin-settings';

import { AdminDropdown } from './AdminDropdown';
import { AdminPanel, AdminPanelHeader } from './AdminPanel';

const GROUP_LABELS: Record<string, string> = {
  auth: 'Google / Auth / OAuth / CORS',
  billing: 'Stripe billing',
  limits: 'Rate limits',
  email: 'Email',
};

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
    return <WebLoading fullscreen={false} label="Loading settings..." />;
  }

  const activeGroup = selectedGroup && visibleGroups.includes(selectedGroup) ? selectedGroup : visibleGroups[0] ?? null;
  const rows = activeGroup ? settings.filter((s) => s.group === activeGroup) : [];

  return (
    <View className="gap-3">
      <AdminPanel>
        <AdminPanelHeader
          error={error}
          subtitle="Pick a module to configure it. Saved values take effect within ~30s, no redeploy. Empty a field to fall back to the env default. Per-environment."
          title="Operational settings"
        />
        {visibleGroups.length > 0 ? (
          <AdminDropdown
            labelForValue={(value) => (value ? GROUP_LABELS[value] ?? value : 'Select module')}
            onChange={(value) => setSelectedGroup(value)}
            options={visibleGroups.map((group) => ({ label: GROUP_LABELS[group] ?? group, value: group }))}
            value={activeGroup}
          />
        ) : null}
      </AdminPanel>

      {activeGroup && rows.length > 0 ? (
        <AdminPanel>
          <AdminPanelHeader title={GROUP_LABELS[activeGroup] ?? activeGroup} />
          <View className="gap-2">
            {rows.map((item) => (
              <SettingRow key={item.key} item={item} onReveal={reveal} onSave={save} />
            ))}
          </View>
        </AdminPanel>
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
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <WebTag size="sm" variant={item.source === 'db' ? 'rose' : item.source === 'env' ? 'brand' : 'neutral'}>
        {label}
      </WebTag>
      {item.updated_by ? <Text className="text-caption text-app-muted">{item.updated_by}</Text> : null}
    </View>
  );
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
      <View className="gap-3 rounded-xl border border-app-line bg-app-sunken/60 p-3">
        <RowHeader item={item} />
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <SourceTag item={item} />
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void run(on ? 'false' : 'true')}
            className={`rounded-full border px-4 py-2 ${on ? 'border-app-rose/70 bg-app-canvas/70' : 'border-app-line bg-app-canvas/70 hover:bg-app-brand-soft/70'}`}
          >
            <Text className={`text-body-sm font-semibold ${on ? 'text-app-rose-deep' : 'text-app-muted'}`}>{on ? 'On' : 'Off'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-3 rounded-xl border border-app-line bg-app-sunken/60 p-3">
      <RowHeader item={item} />
      <WebInput
        keyboardType={item.type === 'number' ? 'number-pad' : 'default'}
        label={isSecret ? 'Replacement value' : 'Value'}
        onChangeText={setDraft}
        placeholder={isSecret ? (item.is_set ? '•••••• set — type to replace' : 'not set') : 'value'}
        secureTextEntry={isSecret}
        value={draft}
      />
      {isSecret ? (
        <View className="gap-2 rounded-xl border border-app-line bg-app-surface p-3">
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-overline text-app-muted">Current secret</Text>
              <Text numberOfLines={1} className="mt-1 font-mono text-body-sm text-app-ink">
                {showRevealed ? revealed || '(empty)' : item.is_set ? '****' : 'missing'}
              </Text>
            </View>
            <WebButton
              disabled={!onReveal || isRevealing || !item.is_set}
              isLoading={isRevealing}
              label={showRevealed ? 'Hide' : 'View'}
              onPress={() => void toggleReveal()}
              size="sm"
              variant={showRevealed ? 'secondary' : 'outline'}
            />
          </View>
        </View>
      ) : null}
      {isDangerous ? (
        <View>
          <WebInput
            label="Confirm by typing the setting key"
            onChangeText={setConfirm}
            placeholder={item.key}
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
            <WebButton
              disabled={busy || (isDangerous && confirm.trim() !== item.key)}
              label="Reset"
              onPress={() => void run('')}
              size="sm"
              variant="outline"
            />
          ) : null}
          <WebButton
            disabled={busy || (isSecret ? draft.trim() === '' : draft === (item.value ?? '')) || (isDangerous && confirm.trim() !== item.key)}
            isLoading={busy}
            label="Save"
            onPress={() => void run(draft)}
            size="sm"
          />
        </View>
      </View>
    </View>
  );
}

function StatusOnlySettingRow({ item }: { item: AdminSettingItem }) {
  return (
    <View className="gap-3 rounded-xl border border-app-line bg-app-sunken/60 p-3 opacity-75">
      <RowHeader item={item} />
      <View className="flex-row items-center justify-between gap-3 rounded-xl border border-app-line bg-app-surface p-3">
        <View className="min-w-0 flex-1">
          <Text className="text-overline text-app-muted">Environment status</Text>
          <Text className="mt-1 text-body-sm font-semibold text-app-ink">
            {item.is_set ? 'Configured' : 'Missing'}
          </Text>
        </View>
        <WebTag size="sm" variant={item.is_set ? 'brand' : 'neutral'}>
          {item.is_set ? 'Set' : 'Unset'}
        </WebTag>
      </View>
      <SourceTag item={item} />
    </View>
  );
}

export function RowHeader({ item }: { item: AdminSettingItem }) {
  return (
    <View>
      <Text className="text-body-sm font-semibold text-app-ink">{item.label}</Text>
      <Text className="text-caption text-app-muted">{item.env_key ? `${item.env_key} · ` : ''}{item.key}</Text>
      {item.description ? <Text className="text-caption text-app-muted">{item.description}</Text> : null}
      {item.admin_mode === 'status_only' ? <Text className="text-caption font-semibold text-app-muted">Managed in environment secrets; value is not viewable or editable here.</Text> : null}
      {item.danger_level === 'high' ? <Text className="text-caption font-semibold text-app-rose-deep">High-risk runtime setting</Text> : null}
    </View>
  );
}
