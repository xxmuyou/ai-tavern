import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import type { AdminImageModel, ImageModelInput } from '@/api/types';
import { Button } from '@/components/Button';
import { useAdminImageModels } from '@/hooks/use-admin-image-models';

const INPUT_CLASS = 'min-h-12 rounded-lg border border-app-line bg-white px-4 text-base text-app-text';

/**
 * Model catalog for a single workflow ("workflow -> models", spec-022). Models
 * are the single source of truth for checkpoints: each carries a free-form tag,
 * a checkpoint file, and the field name on the workflow's checkpoint node.
 * Variation workflows (e.g. WF2) don't switch checkpoints, so they show no
 * catalog.
 */
export function ImageModelsSection({
  workflowKey,
  mode,
}: {
  workflowKey: string;
  mode: 'create' | 'variation';
}) {
  const { models, isLoading, error, create, update, remove } = useAdminImageModels();

  if (isLoading) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color="#1E6B52" />
      </View>
    );
  }

  if (mode === 'variation') {
    return (
      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-lg font-semibold text-app-text">Model catalog</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          This workflow is image-to-image and doesn&apos;t switch checkpoints, so it has no model
          catalog.
        </Text>
      </View>
    );
  }

  const scoped = models.filter((model) => model.workflow_key === workflowKey);

  return (
    <View className="gap-4">
      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-lg font-semibold text-app-text">Model catalog</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Models offered when creating a companion on this workflow. Each model maps to a RunningHub
          checkpoint.
        </Text>
        {error ? <Text className="mt-2 text-sm font-semibold text-app-danger">{error}</Text> : null}
        <View className="mt-4 gap-3">
          {scoped.map((model) => (
            <ModelRow key={model.id} model={model} onSave={update} onDelete={remove} />
          ))}
          {scoped.length === 0 ? (
            <Text className="text-sm text-app-muted">No models yet — add one below.</Text>
          ) : null}
        </View>
      </View>

      <AddModelForm workflowKey={workflowKey} onCreate={create} />
    </View>
  );
}

function toDraft(model: AdminImageModel): ImageModelInput {
  return {
    label: model.label,
    tag: model.tag,
    ckpt_name: model.ckpt_name,
    checkpoint_field_name: model.checkpoint_field_name ?? '',
    workflow_key: model.workflow_key,
    is_active: model.is_active,
    sort_order: model.sort_order,
  };
}

function ModelRow({
  model,
  onSave,
  onDelete,
}: {
  model: AdminImageModel;
  onSave: (id: string, input: ImageModelInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ImageModelInput>(() => toDraft(model));
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-3 rounded-lg border border-app-line bg-app-bg p-4">
      <ModelFields draft={draft} setDraft={setDraft} />
      {!model.checkpoint_applies ? (
        <Text className="text-xs font-semibold text-app-danger">
          ⚠ Checkpoint won&apos;t apply: this workflow has no checkpoint node configured. Set its
          checkpoint node id in the workflow wiring above, or this model falls back to the
          workflow&apos;s built-in checkpoint.
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            disabled={busy}
            isLoading={busy}
            label="Save"
            onPress={() => void run(() => onSave(model.id, draft))}
          />
        </View>
        <View className="w-28">
          <Button disabled={busy} label="Delete" onPress={() => void run(() => onDelete(model.id))} variant="secondary" />
        </View>
      </View>
      {model.updated_by_email ? (
        <Text className="text-xs text-app-muted">updated by {model.updated_by_email}</Text>
      ) : null}
    </View>
  );
}

function AddModelForm({
  workflowKey,
  onCreate,
}: {
  workflowKey: string;
  onCreate: (input: ImageModelInput) => Promise<void>;
}) {
  const empty: ImageModelInput = {
    label: '',
    tag: '',
    ckpt_name: '',
    checkpoint_field_name: '',
    workflow_key: workflowKey,
    is_active: true,
    sort_order: 0,
  };
  const [draft, setDraft] = useState<ImageModelInput>(empty);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!draft.label.trim() || !draft.ckpt_name.trim()) return;
    setBusy(true);
    try {
      await onCreate({ ...draft, workflow_key: workflowKey });
      setDraft(empty);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-3 rounded-lg border border-app-line bg-white p-5">
      <Text className="text-base font-semibold text-app-text">Add a model</Text>
      <ModelFields draft={draft} setDraft={setDraft} />
      <Button
        disabled={busy || !draft.label.trim() || !draft.ckpt_name.trim()}
        isLoading={busy}
        label="Add model"
        onPress={() => void submit()}
      />
    </View>
  );
}

function ModelFields({
  draft,
  setDraft,
}: {
  draft: ImageModelInput;
  setDraft: (next: ImageModelInput) => void;
}) {
  return (
    <View className="gap-3">
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">Label</Text>
        <TextInput
          className={INPUT_CLASS}
          onChangeText={(label) => setDraft({ ...draft, label })}
          placeholder="Realistic — Juggernaut XL"
          placeholderTextColor="#687076"
          value={draft.label}
        />
      </View>
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">Checkpoint name</Text>
        <TextInput
          className={INPUT_CLASS}
          onChangeText={(ckpt_name) => setDraft({ ...draft, ckpt_name })}
          placeholder="juggernautXL_ragnarokBy.safetensors"
          placeholderTextColor="#687076"
          value={draft.ckpt_name}
        />
      </View>
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">Tag (free label / category)</Text>
        <TextInput
          className={INPUT_CLASS}
          onChangeText={(tag) => setDraft({ ...draft, tag })}
          placeholder="realistic"
          placeholderTextColor="#687076"
          value={draft.tag}
        />
      </View>
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">
          Checkpoint field name (node field, e.g. Realistic)
        </Text>
        <TextInput
          className={INPUT_CLASS}
          onChangeText={(checkpoint_field_name) => setDraft({ ...draft, checkpoint_field_name })}
          placeholder="ckpt_name"
          placeholderTextColor="#687076"
          value={draft.checkpoint_field_name ?? ''}
        />
      </View>
      <View className="flex-row items-center gap-4">
        <View className="flex-1">
          <Text className="mb-1 text-xs font-semibold text-app-muted">Sort order</Text>
          <TextInput
            className={INPUT_CLASS}
            keyboardType="number-pad"
            onChangeText={(value) => setDraft({ ...draft, sort_order: Number(value) || 0 })}
            placeholder="0"
            placeholderTextColor="#687076"
            value={String(draft.sort_order)}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setDraft({ ...draft, is_active: !draft.is_active })}
          className={`mt-5 rounded-full border px-3 py-2 ${
            draft.is_active ? 'border-app-primary bg-app-primary' : 'border-app-line bg-white'
          }`}
        >
          <Text className={`text-sm font-semibold ${draft.is_active ? 'text-white' : 'text-app-muted'}`}>
            {draft.is_active ? 'Active' : 'Inactive'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
