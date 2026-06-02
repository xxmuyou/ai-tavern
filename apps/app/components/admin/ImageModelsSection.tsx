import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { AdminImageModel, AdminImageWorkflow, ImageModelInput, ImageWorkflowInput } from '@/api/types';
import { WebButton, WebLoading } from '@/components/web/ui';
import { useAdminImageModels, useAdminImageWorkflows } from '@/hooks/use-admin-image-models';

const INPUT_CLASS = 'min-h-12 rounded-lg border border-app-line bg-app-surface px-4 text-base text-app-ink';

/**
 * RunningHub catalog admin.
 *
 * Checkpoints are reusable model rows. Workflows own node wiring and select
 * which checkpoints are available for that workflow.
 */
export function ImageModelsSection() {
  const modelState = useAdminImageModels();
  const workflowState = useAdminImageWorkflows();
  const isLoading = modelState.isLoading || workflowState.isLoading;

  if (isLoading) {
    return (
      <View className="items-center py-12">
        <WebLoading fullscreen={false} label="Loading..." />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <CheckpointCatalog
        error={modelState.error}
        models={modelState.models}
        onCreate={modelState.create}
        onDelete={modelState.remove}
        onSave={modelState.update}
      />
      <WorkflowCatalog
        error={workflowState.error}
        models={modelState.models}
        onCreate={workflowState.create}
        onDelete={workflowState.remove}
        onSave={workflowState.update}
        workflows={workflowState.workflows}
      />
    </View>
  );
}

function CheckpointCatalog({
  error,
  models,
  onCreate,
  onDelete,
  onSave,
}: {
  error: string | null;
  models: AdminImageModel[];
  onCreate: (input: ImageModelInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSave: (id: string, input: ImageModelInput) => Promise<void>;
}) {
  return (
    <View className="gap-4 rounded-2xl border border-app-line bg-app-surface p-6 shadow-card">
      <View>
        <Text className="text-lg font-semibold text-app-ink">Checkpoint catalog</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Add uploaded RunningHub checkpoints here first. Tags are free-form categories for filtering
          and display; checkpoint node field names are managed on workflows.
        </Text>
        {error ? <Text className="mt-2 text-sm font-semibold text-rose-deep">{error}</Text> : null}
      </View>
      <View className="gap-3">
        {models.map((model) => (
          <CheckpointRow key={model.id} model={model} onDelete={onDelete} onSave={onSave} />
        ))}
        {models.length === 0 ? <Text className="text-sm text-app-muted">No checkpoints yet.</Text> : null}
      </View>
      <AddCheckpointForm onCreate={onCreate} />
    </View>
  );
}

function CheckpointRow({
  model,
  onDelete,
  onSave,
}: {
  model: AdminImageModel;
  onDelete: (id: string) => Promise<void>;
  onSave: (id: string, input: ImageModelInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ImageModelInput>(() => toModelDraft(model));
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
    <View className="gap-3 rounded-xl border border-app-line bg-app-sunken/60 p-4">
      <ModelFields draft={draft} setDraft={setDraft} />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <WebButton disabled={busy} isLoading={busy} label="Save" onPress={() => void run(() => onSave(model.id, draft))} />
        </View>
        <View className="w-28">
          <WebButton disabled={busy} label="Delete" onPress={() => void run(() => onDelete(model.id))} variant="secondary" />
        </View>
      </View>
      {model.updated_by_email ? <Text className="text-xs text-app-muted">updated by {model.updated_by_email}</Text> : null}
    </View>
  );
}

function AddCheckpointForm({ onCreate }: { onCreate: (input: ImageModelInput) => Promise<void> }) {
  const empty = emptyModelDraft();
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
    <View className="gap-3 rounded-xl border border-app-line bg-app-sunken/60 p-4">
      <Text className="text-base font-semibold text-app-ink">Add checkpoint</Text>
      <ModelFields draft={draft} setDraft={setDraft} />
      <WebButton disabled={busy || !draft.label.trim() || !draft.ckpt_name.trim()} isLoading={busy} label="Add checkpoint" onPress={() => void submit()} />
    </View>
  );
}

function ModelFields({ draft, setDraft }: { draft: ImageModelInput; setDraft: (next: ImageModelInput) => void }) {
  return (
    <View className="gap-3">
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">Name</Text>
        <TextInput className={INPUT_CLASS} onChangeText={(label) => setDraft({ ...draft, label })} placeholder="Anime JP - Animagine XL" placeholderTextColor="#687076" value={draft.label} />
      </View>
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">Checkpoint name</Text>
        <TextInput className={INPUT_CLASS} onChangeText={(ckpt_name) => setDraft({ ...draft, ckpt_name })} placeholder="animagineXL40_v4Opt.safetensors" placeholderTextColor="#687076" value={draft.ckpt_name} />
      </View>
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">Tags</Text>
        <TextInput className={INPUT_CLASS} onChangeText={(tag) => setDraft({ ...draft, tag })} placeholder="anime,jp" placeholderTextColor="#687076" value={draft.tag} />
      </View>
      <View className="flex-row items-center gap-4">
        <View className="flex-1">
          <Text className="mb-1 text-xs font-semibold text-app-muted">Sort order</Text>
          <TextInput className={INPUT_CLASS} keyboardType="number-pad" onChangeText={(value) => setDraft({ ...draft, sort_order: Number(value) || 0 })} placeholder="0" placeholderTextColor="#687076" value={String(draft.sort_order)} />
        </View>
        <ActiveToggle active={draft.is_active} onPress={() => setDraft({ ...draft, is_active: !draft.is_active })} />
      </View>
    </View>
  );
}

function WorkflowCatalog({
  error,
  models,
  onCreate,
  onDelete,
  onSave,
  workflows,
}: {
  error: string | null;
  models: AdminImageModel[];
  onCreate: (input: ImageWorkflowInput) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  onSave: (key: string, input: ImageWorkflowInput) => Promise<void>;
  workflows: AdminImageWorkflow[];
}) {
  return (
    <View className="gap-4 rounded-2xl border border-app-line bg-app-surface p-6 shadow-card">
      <View>
        <Text className="text-lg font-semibold text-app-ink">RunningHub workflows</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          A workflow owns node IDs and the checkpoint field name. Pick which catalog checkpoints are
          available for each create workflow.
        </Text>
        {error ? <Text className="mt-2 text-sm font-semibold text-rose-deep">{error}</Text> : null}
      </View>
      <View className="gap-3">
        {workflows.map((workflow) => (
          <WorkflowRow key={workflow.key} models={models} onDelete={onDelete} onSave={onSave} workflow={workflow} />
        ))}
        {workflows.length === 0 ? <Text className="text-sm text-app-muted">No workflows yet.</Text> : null}
      </View>
      <AddWorkflowForm models={models} onCreate={onCreate} />
    </View>
  );
}

function WorkflowRow({
  models,
  onDelete,
  onSave,
  workflow,
}: {
  models: AdminImageModel[];
  onDelete: (key: string) => Promise<void>;
  onSave: (key: string, input: ImageWorkflowInput) => Promise<void>;
  workflow: AdminImageWorkflow;
}) {
  const [draft, setDraft] = useState<ImageWorkflowInput>(() => toWorkflowDraft(workflow));
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
    <View className="gap-3 rounded-xl border border-app-line bg-app-sunken/60 p-4">
      <WorkflowFields draft={draft} isNew={false} models={models} setDraft={setDraft} />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <WebButton disabled={busy} isLoading={busy} label="Save" onPress={() => void run(() => onSave(workflow.key, draft))} />
        </View>
        <View className="w-28">
          <WebButton disabled={busy} label="Delete" onPress={() => void run(() => onDelete(workflow.key))} variant="secondary" />
        </View>
      </View>
      {workflow.updated_by_email ? <Text className="text-xs text-app-muted">updated by {workflow.updated_by_email}</Text> : null}
    </View>
  );
}

function AddWorkflowForm({ models, onCreate }: { models: AdminImageModel[]; onCreate: (input: ImageWorkflowInput) => Promise<void> }) {
  const empty = emptyWorkflowDraft();
  const [draft, setDraft] = useState<ImageWorkflowInput>(empty);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!draft.key.trim() || !draft.label.trim()) return;
    setBusy(true);
    try {
      await onCreate(draft);
      setDraft(empty);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-3 rounded-xl border border-app-line bg-app-sunken/60 p-4">
      <Text className="text-base font-semibold text-app-ink">Add workflow</Text>
      <WorkflowFields draft={draft} isNew models={models} setDraft={setDraft} />
      <WebButton disabled={busy || !draft.key.trim() || !draft.label.trim()} isLoading={busy} label="Add workflow" onPress={() => void submit()} />
    </View>
  );
}

function WorkflowFields({
  draft,
  isNew,
  models,
  setDraft,
}: {
  draft: ImageWorkflowInput;
  isNew: boolean;
  models: AdminImageModel[];
  setDraft: (next: ImageWorkflowInput) => void;
}) {
  const isCreate = draft.mode === 'create';
  return (
    <View className="gap-3">
      <View className="web:grid web:grid-cols-2 web:gap-3">
        <Field label="Workflow key">
          <TextInput className={INPUT_CLASS} editable={isNew} onChangeText={(key) => setDraft({ ...draft, key })} placeholder="wf1" placeholderTextColor="#687076" value={draft.key} />
        </Field>
        <Field label="Name">
          <TextInput className={INPUT_CLASS} onChangeText={(label) => setDraft({ ...draft, label })} placeholder="WF1 - base portrait" placeholderTextColor="#687076" value={draft.label} />
        </Field>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {(['create', 'variation'] as const).map((mode) => (
          <Pressable
            key={mode}
            accessibilityRole="button"
            onPress={() => setDraft({ ...draft, mode })}
            className={`rounded-full border px-3 py-2 ${draft.mode === mode ? 'border-rose bg-rose-soft shadow-glow-soft' : 'border-app-line bg-app-canvas/70 hover:bg-app-brand-soft/70'}`}
          >
            <Text className={`text-sm font-semibold ${draft.mode === mode ? 'text-rose-deep' : 'text-app-muted'}`}>{mode}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="RunningHub workflow ID">
        <TextInput className={INPUT_CLASS} onChangeText={(workflow_id) => setDraft({ ...draft, workflow_id })} placeholder="2060270467856035841" placeholderTextColor="#687076" value={draft.workflow_id} />
      </Field>
      <Field label="Prompt node ID">
        <TextInput className={INPUT_CLASS} onChangeText={(prompt_node_id) => setDraft({ ...draft, prompt_node_id })} placeholder="2" placeholderTextColor="#687076" value={draft.prompt_node_id} />
      </Field>
      {isCreate ? (
        <>
          <Field label="Checkpoint node ID">
            <TextInput className={INPUT_CLASS} onChangeText={(checkpoint_node_id) => setDraft({ ...draft, checkpoint_node_id })} placeholder="1" placeholderTextColor="#687076" value={draft.checkpoint_node_id ?? ''} />
          </Field>
          <Field label="Checkpoint field name">
            <TextInput className={INPUT_CLASS} onChangeText={(checkpoint_field_name) => setDraft({ ...draft, checkpoint_field_name })} placeholder="ckpt_name" placeholderTextColor="#687076" value={draft.checkpoint_field_name ?? ''} />
          </Field>
          <ModelPicker draft={draft} models={models} setDraft={setDraft} />
        </>
      ) : (
        <Field label="Load image node ID">
          <TextInput className={INPUT_CLASS} onChangeText={(load_image_node_id) => setDraft({ ...draft, load_image_node_id })} placeholder="1" placeholderTextColor="#687076" value={draft.load_image_node_id ?? ''} />
        </Field>
      )}
      <View className="flex-row items-center gap-4">
        <View className="flex-1">
          <Text className="mb-1 text-xs font-semibold text-app-muted">Sort order</Text>
          <TextInput className={INPUT_CLASS} keyboardType="number-pad" onChangeText={(value) => setDraft({ ...draft, sort_order: Number(value) || 0 })} placeholder="0" placeholderTextColor="#687076" value={String(draft.sort_order)} />
        </View>
        <ActiveToggle active={draft.is_active} onPress={() => setDraft({ ...draft, is_active: !draft.is_active })} />
      </View>
    </View>
  );
}

function ModelPicker({ draft, models, setDraft }: { draft: ImageWorkflowInput; models: AdminImageModel[]; setDraft: (next: ImageWorkflowInput) => void }) {
  function toggle(modelId: string) {
    const active = draft.model_ids.includes(modelId);
    setDraft({
      ...draft,
      model_ids: active ? draft.model_ids.filter((id) => id !== modelId) : [...draft.model_ids, modelId],
    });
  }
  return (
    <View>
      <Text className="mb-2 text-xs font-semibold text-app-muted">Available checkpoints</Text>
      <View className="flex-row flex-wrap gap-2">
        {models.map((model) => {
          const active = draft.model_ids.includes(model.id);
          return (
            <Pressable
              key={model.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => toggle(model.id)}
              className={`rounded-full border px-3 py-2 ${active ? 'border-rose bg-rose-soft shadow-glow-soft' : 'border-app-line bg-app-canvas/70 hover:bg-app-brand-soft/70'}`}
            >
              <Text className={`text-sm font-semibold ${active ? 'text-rose-deep' : 'text-app-muted'}`}>{model.label}</Text>
            </Pressable>
          );
        })}
        {models.length === 0 ? <Text className="text-sm text-app-muted">Add checkpoints first.</Text> : null}
      </View>
    </View>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-xs font-semibold text-app-muted">{label}</Text>
      {children}
    </View>
  );
}

function ActiveToggle({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`mt-5 rounded-full border px-3 py-2 ${active ? 'border-rose bg-rose-soft shadow-glow-soft' : 'border-app-line bg-app-canvas/70 hover:bg-app-brand-soft/70'}`}
    >
      <Text className={`text-sm font-semibold ${active ? 'text-rose-deep' : 'text-app-muted'}`}>{active ? 'Active' : 'Inactive'}</Text>
    </Pressable>
  );
}

function emptyModelDraft(): ImageModelInput {
  return { ckpt_name: '', is_active: true, label: '', sort_order: 0, tag: '' };
}

function toModelDraft(model: AdminImageModel): ImageModelInput {
  return {
    ckpt_name: model.ckpt_name,
    is_active: model.is_active,
    label: model.label,
    sort_order: model.sort_order,
    tag: model.tag,
  };
}

function emptyWorkflowDraft(): ImageWorkflowInput {
  return {
    checkpoint_field_name: 'ckpt_name',
    checkpoint_node_id: null,
    is_active: true,
    key: '',
    label: '',
    load_image_node_id: null,
    mode: 'create',
    model_ids: [],
    prompt_node_id: '',
    sort_order: 0,
    workflow_id: '',
  };
}

function toWorkflowDraft(workflow: AdminImageWorkflow): ImageWorkflowInput {
  return {
    checkpoint_field_name: workflow.checkpoint_field_name,
    checkpoint_node_id: workflow.checkpoint_node_id,
    is_active: workflow.is_active,
    key: workflow.key,
    label: workflow.label,
    load_image_node_id: workflow.load_image_node_id,
    mode: workflow.mode,
    model_ids: workflow.model_ids,
    prompt_node_id: workflow.prompt_node_id,
    sort_order: workflow.sort_order,
    workflow_id: workflow.workflow_id,
  };
}
