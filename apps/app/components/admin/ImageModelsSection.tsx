import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import type { AdminImageModel, ArtStyle, ImageModelInput } from '@/api/types';
import { Button } from '@/components/Button';
import { useAdminImageModels } from '@/hooks/use-admin-image-models';

const STYLE_TAGS: ArtStyle[] = ['realistic', 'anime_jp', 'anime_kr'];
const INPUT_CLASS = 'min-h-12 rounded-lg border border-app-line bg-white px-4 text-base text-app-text';

export function ImageModelsSection() {
  const { models, isLoading, error, create, update, remove } = useAdminImageModels();

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
        <Text className="text-lg font-semibold text-app-text">WF1 model catalog</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Models offered when creating a companion. Each model maps to a RunningHub checkpoint.
        </Text>
        {error ? <Text className="mt-2 text-sm font-semibold text-app-danger">{error}</Text> : null}
        <View className="mt-4 gap-3">
          {models.map((model) => (
            <ModelRow key={model.id} model={model} onSave={update} onDelete={remove} />
          ))}
          {models.length === 0 ? (
            <Text className="text-sm text-app-muted">No models yet — add one below.</Text>
          ) : null}
        </View>
      </View>

      <AddModelForm onCreate={create} />
    </View>
  );
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
  const [draft, setDraft] = useState<ImageModelInput>({
    label: model.label,
    style_tag: model.style_tag,
    ckpt_name: model.ckpt_name,
    is_active: model.is_active,
    sort_order: model.sort_order,
  });
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

function AddModelForm({ onCreate }: { onCreate: (input: ImageModelInput) => Promise<void> }) {
  const empty: ImageModelInput = {
    label: '',
    style_tag: 'realistic',
    ckpt_name: '',
    is_active: true,
    sort_order: 0,
  };
  const [draft, setDraft] = useState<ImageModelInput>(empty);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!draft.label.trim() || !draft.ckpt_name.trim()) return;
    setBusy(true);
    try {
      await onCreate(draft);
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
        <Text className="mb-1 text-xs font-semibold text-app-muted">Style tag</Text>
        <View className="flex-row flex-wrap gap-2">
          {STYLE_TAGS.map((tag) => (
            <Pressable
              key={tag}
              accessibilityRole="button"
              onPress={() => setDraft({ ...draft, style_tag: tag })}
              className={`rounded-full border px-3 py-2 ${
                draft.style_tag === tag ? 'border-app-primary bg-app-primary' : 'border-app-line bg-white'
              }`}
            >
              <Text className={`text-sm font-semibold ${draft.style_tag === tag ? 'text-white' : 'text-app-muted'}`}>
                {tag}
              </Text>
            </Pressable>
          ))}
        </View>
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
