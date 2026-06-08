import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { AdminImageLora, AdminImageModel, AdminImageWorkflow, ImageLoraInput, ImageModelInput, ImageWorkflowInput } from '@/api/types';
import { WebButton, WebLoading } from '@/components/web/ui';
import { useAdminImageLoras, useAdminImageModels, useAdminImageWorkflows } from '@/hooks/use-admin-image-models';

import { AdminCollapsible, AdminPanel, AdminPanelHeader } from './AdminPanel';

const INPUT_CLASS = 'min-h-9 rounded-lg border border-app-line bg-app-surface px-3 text-sm text-app-ink';
const BASE_ARCHITECTURES = ['sdxl', 'sd15', 'ilxl', 'flux1'] as const;

/**
 * RunningHub catalog admin.
 *
 * Checkpoints are reusable model rows. Workflows own node wiring and select
 * which checkpoints are available for that workflow.
 */
export function ImageModelsSection() {
  const modelState = useAdminImageModels();
  const loraState = useAdminImageLoras();
  const workflowState = useAdminImageWorkflows();
  const isLoading = modelState.isLoading || loraState.isLoading || workflowState.isLoading;

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
      <LoraCatalog
        error={loraState.error}
        loras={loraState.loras}
        onCreate={loraState.create}
        onDelete={loraState.remove}
        onSave={loraState.update}
      />
      <WorkflowCatalog
        error={workflowState.error}
        loras={loraState.loras}
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
    <AdminPanel className="gap-4">
      <AdminPanelHeader
        error={error}
        subtitle="Add uploaded RunningHub checkpoints here first. Tags are free-form categories; checkpoint node field names are managed on workflows."
        title="Checkpoint catalog"
      />
      <View className="gap-2">
        {models.map((model) => (
          <CheckpointRow key={model.id} model={model} onDelete={onDelete} onSave={onSave} />
        ))}
        {models.length === 0 ? <Text className="text-sm text-app-muted">No checkpoints yet.</Text> : null}
      </View>
      <AddCheckpointForm onCreate={onCreate} />
    </AdminPanel>
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
    <AdminCollapsible subtitle={model.ckpt_name} title={model.label || '(unnamed checkpoint)'}>
      <ModelFields draft={draft} setDraft={setDraft} />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <WebButton disabled={busy} isLoading={busy} label="Save" onPress={() => void run(() => onSave(model.id, draft))} size="sm" />
        </View>
        <View className="w-24">
          <WebButton disabled={busy} label="Delete" onPress={() => void run(() => onDelete(model.id))} size="sm" variant="secondary" />
        </View>
      </View>
      {model.updated_by_email ? <Text className="text-xs text-app-muted">updated by {model.updated_by_email}</Text> : null}
    </AdminCollapsible>
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
    <AdminCollapsible title="+ Add checkpoint">
      <ModelFields draft={draft} setDraft={setDraft} />
      <WebButton disabled={busy || !draft.label.trim() || !draft.ckpt_name.trim()} isLoading={busy} label="Add checkpoint" onPress={() => void submit()} size="sm" />
    </AdminCollapsible>
  );
}

function LoraCatalog({
  error,
  loras,
  onCreate,
  onDelete,
  onSave,
}: {
  error: string | null;
  loras: AdminImageLora[];
  onCreate: (input: ImageLoraInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSave: (id: string, input: ImageLoraInput) => Promise<void>;
}) {
  return (
    <AdminPanel className="gap-4">
      <AdminPanelHeader
        error={error}
        subtitle="Add uploaded RunningHub LoRA files here. Availability is controlled by explicit workflow/checkpoint allowlists."
        title="LoRA catalog"
      />
      <View className="gap-2">
        {loras.map((lora) => (
          <LoraRow key={lora.id} lora={lora} onDelete={onDelete} onSave={onSave} />
        ))}
        {loras.length === 0 ? <Text className="text-sm text-app-muted">No LoRAs yet.</Text> : null}
      </View>
      <AddLoraForm onCreate={onCreate} />
    </AdminPanel>
  );
}

function LoraRow({
  lora,
  onDelete,
  onSave,
}: {
  lora: AdminImageLora;
  onDelete: (id: string) => Promise<void>;
  onSave: (id: string, input: ImageLoraInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ImageLoraInput>(() => toLoraDraft(lora));
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
    <AdminCollapsible subtitle={lora.lora_name} title={lora.label || '(unnamed LoRA)'}>
      <LoraFields draft={draft} setDraft={setDraft} />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <WebButton disabled={busy} isLoading={busy} label="Save" onPress={() => void run(() => onSave(lora.id, draft))} size="sm" />
        </View>
        <View className="w-24">
          <WebButton disabled={busy} label="Delete" onPress={() => void run(() => onDelete(lora.id))} size="sm" variant="secondary" />
        </View>
      </View>
      {lora.updated_by_email ? <Text className="text-xs text-app-muted">updated by {lora.updated_by_email}</Text> : null}
    </AdminCollapsible>
  );
}

function AddLoraForm({ onCreate }: { onCreate: (input: ImageLoraInput) => Promise<void> }) {
  const empty = emptyLoraDraft();
  const [draft, setDraft] = useState<ImageLoraInput>(empty);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!draft.label.trim() || !draft.lora_name.trim()) return;
    setBusy(true);
    try {
      await onCreate(draft);
      setDraft(empty);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCollapsible title="+ Add LoRA">
      <LoraFields draft={draft} setDraft={setDraft} />
      <WebButton disabled={busy || !draft.label.trim() || !draft.lora_name.trim()} isLoading={busy} label="Add LoRA" onPress={() => void submit()} size="sm" />
    </AdminCollapsible>
  );
}

function ModelFields({ draft, setDraft }: { draft: ImageModelInput; setDraft: (next: ImageModelInput) => void }) {
  return (
    <View className="gap-3">
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">Name</Text>
        <TextInput className={INPUT_CLASS} onChangeText={(label) => setDraft({ ...draft, label })} placeholder="Anime - Animagine XL" placeholderTextColor="#687076" value={draft.label} />
      </View>
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">Checkpoint name</Text>
        <TextInput className={INPUT_CLASS} onChangeText={(ckpt_name) => setDraft({ ...draft, ckpt_name })} placeholder="animagineXL40_v4Opt.safetensors" placeholderTextColor="#687076" value={draft.ckpt_name} />
      </View>
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">Tags</Text>
        <TextInput className={INPUT_CLASS} onChangeText={(tag) => setDraft({ ...draft, tag })} placeholder="anime" placeholderTextColor="#687076" value={draft.tag} />
      </View>
      <AssetTagFields draft={draft} setDraft={setDraft} />
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

function LoraFields({ draft, setDraft }: { draft: ImageLoraInput; setDraft: (next: ImageLoraInput) => void }) {
  return (
    <View className="gap-3">
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">Name</Text>
        <TextInput className={INPUT_CLASS} onChangeText={(label) => setDraft({ ...draft, label })} placeholder="Anime detail LoRA" placeholderTextColor="#687076" value={draft.label} />
      </View>
      <View>
        <Text className="mb-1 text-xs font-semibold text-app-muted">LoRA name</Text>
        <TextInput className={INPUT_CLASS} onChangeText={(lora_name) => setDraft({ ...draft, lora_name })} placeholder="anime_detail_v1.safetensors" placeholderTextColor="#687076" value={draft.lora_name} />
      </View>
      <AssetTagFields draft={draft} setDraft={setDraft} />
      <View className="web:grid web:grid-cols-2 web:gap-3">
        <Field label="Model strength">
          <TextInput className={INPUT_CLASS} keyboardType="decimal-pad" onChangeText={(value) => setDraft({ ...draft, default_model_strength: Number(value) || 0 })} placeholder="1" placeholderTextColor="#687076" value={String(draft.default_model_strength)} />
        </Field>
        <Field label="Clip strength">
          <TextInput className={INPUT_CLASS} keyboardType="decimal-pad" onChangeText={(value) => setDraft({ ...draft, default_clip_strength: value.trim() ? Number(value) || 0 : null })} placeholder="optional" placeholderTextColor="#687076" value={draft.default_clip_strength == null ? '' : String(draft.default_clip_strength)} />
        </Field>
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

function AssetTagFields<T extends { architecture?: string; purpose?: string; style_family?: string; tags?: string }>({
  draft,
  setDraft,
}: {
  draft: T;
  setDraft: (next: T) => void;
}) {
  return (
    <View className="web:grid web:grid-cols-2 web:gap-3">
      <Field label="Architecture">
        <ArchitecturePicker onChange={(architecture) => setDraft({ ...draft, architecture })} value={draft.architecture ?? ''} />
      </Field>
      <Field label="Style family">
        <TextInput className={INPUT_CLASS} onChangeText={(style_family) => setDraft({ ...draft, style_family })} placeholder="anime / realistic" placeholderTextColor="#687076" value={draft.style_family ?? ''} />
      </Field>
      <Field label="Purpose">
        <TextInput className={INPUT_CLASS} onChangeText={(purpose) => setDraft({ ...draft, purpose })} placeholder="portrait / outfit" placeholderTextColor="#687076" value={draft.purpose ?? ''} />
      </Field>
      <Field label="Free tags">
        <TextInput className={INPUT_CLASS} onChangeText={(tags) => setDraft({ ...draft, tags })} placeholder="anime" placeholderTextColor="#687076" value={draft.tags ?? ''} />
      </Field>
    </View>
  );
}

function ArchitecturePicker({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const architectures = BASE_ARCHITECTURES;
  return (
    <View className="flex-row flex-wrap gap-2">
      {architectures.map((architecture) => {
        const active = value === architecture;
        return (
          <Pressable
            key={architecture}
            accessibilityRole="button"
            onPress={() => onChange(architecture)}
            className={`rounded-full border px-3 py-2 ${active ? 'border-rose bg-rose-soft shadow-glow-soft' : 'border-app-line bg-app-canvas/70 hover:bg-app-brand-soft/70'}`}
          >
            <Text className={`text-sm font-semibold ${active ? 'text-rose-deep' : 'text-app-muted'}`}>{architecture}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function WorkflowCatalog({
  error,
  loras,
  models,
  onCreate,
  onDelete,
  onSave,
  workflows,
}: {
  error: string | null;
  loras: AdminImageLora[];
  models: AdminImageModel[];
  onCreate: (input: ImageWorkflowInput) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  onSave: (key: string, input: ImageWorkflowInput) => Promise<void>;
  workflows: AdminImageWorkflow[];
}) {
  return (
    <AdminPanel className="gap-4">
      <AdminPanelHeader
        error={error}
        subtitle="A workflow owns node IDs and the checkpoint field name. Pick which catalog checkpoints are available for each create workflow."
        title="RunningHub workflows"
      />
      <View className="gap-2">
        {workflows.map((workflow) => (
          <WorkflowRow key={workflow.key} loras={loras} models={models} onDelete={onDelete} onSave={onSave} workflow={workflow} />
        ))}
        {workflows.length === 0 ? <Text className="text-sm text-app-muted">No workflows yet.</Text> : null}
      </View>
      <AddWorkflowForm loras={loras} models={models} onCreate={onCreate} />
    </AdminPanel>
  );
}

function WorkflowRow({
  loras,
  models,
  onDelete,
  onSave,
  workflow,
}: {
  loras: AdminImageLora[];
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
    <AdminCollapsible subtitle={workflowSubtitle(workflow)} title={workflow.label || workflow.key}>
      <WorkflowFields draft={draft} isNew={false} loras={loras} models={models} setDraft={setDraft} />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <WebButton disabled={busy} isLoading={busy} label="Save" onPress={() => void run(() => onSave(workflow.key, draft))} size="sm" />
        </View>
        <View className="w-24">
          <WebButton disabled={busy} label="Delete" onPress={() => void run(() => onDelete(workflow.key))} size="sm" variant="secondary" />
        </View>
      </View>
      {workflow.updated_by_email ? <Text className="text-xs text-app-muted">updated by {workflow.updated_by_email}</Text> : null}
    </AdminCollapsible>
  );
}

function AddWorkflowForm({ loras, models, onCreate }: { loras: AdminImageLora[]; models: AdminImageModel[]; onCreate: (input: ImageWorkflowInput) => Promise<void> }) {
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
    <AdminCollapsible title="+ Add workflow">
      <WorkflowFields draft={draft} isNew loras={loras} models={models} setDraft={setDraft} />
      <WebButton disabled={busy || !draft.key.trim() || !draft.label.trim()} isLoading={busy} label="Add workflow" onPress={() => void submit()} size="sm" />
    </AdminCollapsible>
  );
}

function WorkflowFields({
  draft,
  isNew,
  loras,
  models,
  setDraft,
}: {
  draft: ImageWorkflowInput;
  isNew: boolean;
  loras: AdminImageLora[];
  models: AdminImageModel[];
  setDraft: (next: ImageWorkflowInput) => void;
}) {
  const isCreate = draft.mode === 'create';
  return (
    <View className="gap-3">
      <View className="web:grid web:grid-cols-2 web:gap-3">
        <Field label="Workflow key">
          <TextInput className={INPUT_CLASS} editable={isNew} onChangeText={(key) => setDraft({ ...draft, key })} placeholder="portrait_create" placeholderTextColor="#687076" value={draft.key} />
        </Field>
        <Field label="Name">
          <TextInput className={INPUT_CLASS} onChangeText={(label) => setDraft({ ...draft, label })} placeholder="Portrait create" placeholderTextColor="#687076" value={draft.label} />
        </Field>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {(['create', 'variation', 'cutout'] as const).map((mode) => (
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
      <Field label="Prompt field name">
        <TextInput className={INPUT_CLASS} onChangeText={(prompt_field_name) => setDraft({ ...draft, prompt_field_name })} placeholder="text" placeholderTextColor="#687076" value={draft.prompt_field_name ?? ''} />
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
      ) : null}
      <Field label="Load image node ID">
        <TextInput className={INPUT_CLASS} onChangeText={(load_image_node_id) => setDraft({ ...draft, load_image_node_id })} placeholder="1" placeholderTextColor="#687076" value={draft.load_image_node_id ?? ''} />
      </Field>
      <Field label="Load image field name">
        <TextInput className={INPUT_CLASS} onChangeText={(load_image_field_name) => setDraft({ ...draft, load_image_field_name })} placeholder="image" placeholderTextColor="#687076" value={draft.load_image_field_name ?? ''} />
      </Field>
      <Field label="Negative prompt node ID (anti-deformity)">
        <TextInput className={INPUT_CLASS} onChangeText={(negative_prompt_node_id) => setDraft({ ...draft, negative_prompt_node_id })} placeholder="leave empty to disable" placeholderTextColor="#687076" value={draft.negative_prompt_node_id ?? ''} />
      </Field>
      <Field label="Negative prompt field name">
        <TextInput className={INPUT_CLASS} onChangeText={(negative_prompt_field_name) => setDraft({ ...draft, negative_prompt_field_name })} placeholder="prompt" placeholderTextColor="#687076" value={draft.negative_prompt_field_name ?? ''} />
      </Field>
      <View className="web:grid web:grid-cols-2 web:gap-3">
        <Field label="LoRA node ID">
          <TextInput className={INPUT_CLASS} onChangeText={(lora_node_id) => setDraft({ ...draft, lora_node_id })} placeholder="leave empty to disable" placeholderTextColor="#687076" value={draft.lora_node_id ?? ''} />
        </Field>
        <Field label="LoRA name field">
          <TextInput className={INPUT_CLASS} onChangeText={(lora_name_field_name) => setDraft({ ...draft, lora_name_field_name })} placeholder="lora_name" placeholderTextColor="#687076" value={draft.lora_name_field_name ?? ''} />
        </Field>
        <Field label="LoRA model strength field">
          <TextInput className={INPUT_CLASS} onChangeText={(lora_model_strength_field_name) => setDraft({ ...draft, lora_model_strength_field_name })} placeholder="strength_model" placeholderTextColor="#687076" value={draft.lora_model_strength_field_name ?? ''} />
        </Field>
        <Field label="LoRA clip strength field">
          <TextInput className={INPUT_CLASS} onChangeText={(lora_clip_strength_field_name) => setDraft({ ...draft, lora_clip_strength_field_name })} placeholder="strength_clip" placeholderTextColor="#687076" value={draft.lora_clip_strength_field_name ?? ''} />
        </Field>
      </View>
      <LoraAllowlistPicker draft={draft} loras={loras} models={models} setDraft={setDraft} />
      <Field label="Generation params JSON">
        <TextInput
          className="min-h-24 rounded-lg border border-app-line bg-white px-3 py-2 text-sm text-app-text"
          multiline
          onChangeText={(generation_params_json) => setDraft({ ...draft, generation_params_json })}
          placeholder='{"latentNodeId":"4","widthFieldName":"width","heightFieldName":"height","batchSizeFieldName":"batch_size","ksamplerNodeId":"5","seedFieldName":"seed"}'
          placeholderTextColor="#687076"
          textAlignVertical="top"
          value={draft.generation_params_json ?? ''}
        />
      </Field>
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

function LoraAllowlistPicker({
  draft,
  loras,
  models,
  setDraft,
}: {
  draft: ImageWorkflowInput;
  loras: AdminImageLora[];
  models: AdminImageModel[];
  setDraft: (next: ImageWorkflowInput) => void;
}) {
  const selectedModels = models.filter((model) => draft.model_ids.includes(model.id));
  if (selectedModels.length === 0 || loras.length === 0) {
    return null;
  }

  function toggle(modelId: string, loraId: string) {
    const bindings = draft.lora_bindings ?? [];
    const current = bindings.find((binding) => binding.model_id === modelId)?.lora_ids ?? [];
    const nextIds = current.includes(loraId) ? current.filter((id) => id !== loraId) : [...current, loraId];
    const nextBindings = [
      ...bindings.filter((binding) => binding.model_id !== modelId),
      ...(nextIds.length > 0 ? [{ lora_ids: nextIds, model_id: modelId }] : []),
    ];
    setDraft({ ...draft, lora_bindings: nextBindings });
  }

  return (
    <View className="gap-3">
      <Text className="text-xs font-semibold text-app-muted">LoRA allowlist</Text>
      {selectedModels.map((model) => {
        const active = draft.lora_bindings?.find((binding) => binding.model_id === model.id)?.lora_ids ?? [];
        return (
          <View key={model.id} className="gap-2">
            <Text className="text-xs text-app-muted">{model.label}</Text>
            <View className="flex-row flex-wrap gap-2">
              {loras.filter((lora) => lora.architecture === model.architecture && lora.style_family === model.style_family).map((lora) => {
                const enabled = active.includes(lora.id);
                return (
                  <Pressable
                    key={lora.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: enabled }}
                    onPress={() => toggle(model.id, lora.id)}
                    className={`rounded-full border px-3 py-2 ${enabled ? 'border-rose bg-rose-soft shadow-glow-soft' : 'border-app-line bg-app-canvas/70 hover:bg-app-brand-soft/70'}`}
                  >
                    <Text className={`text-sm font-semibold ${enabled ? 'text-rose-deep' : 'text-app-muted'}`}>{lora.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ModelPicker({ draft, models, setDraft }: { draft: ImageWorkflowInput; models: AdminImageModel[]; setDraft: (next: ImageWorkflowInput) => void }) {
  function toggle(modelId: string) {
    const active = draft.model_ids.includes(modelId);
    setDraft({
      ...draft,
      lora_bindings: active ? draft.lora_bindings?.filter((binding) => binding.model_id !== modelId) : draft.lora_bindings,
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
  return { architecture: 'sdxl', ckpt_name: '', is_active: true, label: '', purpose: '', sort_order: 0, style_family: '', tag: '', tags: '' };
}

function toModelDraft(model: AdminImageModel): ImageModelInput {
  return {
    architecture: model.architecture,
    ckpt_name: model.ckpt_name,
    is_active: model.is_active,
    label: model.label,
    purpose: model.purpose,
    sort_order: model.sort_order,
    style_family: model.style_family,
    tag: model.tag,
    tags: model.tags,
  };
}

function emptyLoraDraft(): ImageLoraInput {
  return {
    architecture: 'sdxl',
    default_clip_strength: null,
    default_model_strength: 1,
    is_active: true,
    label: '',
    lora_name: '',
    purpose: '',
    sort_order: 0,
    style_family: '',
    tags: '',
  };
}

function toLoraDraft(lora: AdminImageLora): ImageLoraInput {
  return {
    architecture: lora.architecture,
    default_clip_strength: lora.default_clip_strength,
    default_model_strength: lora.default_model_strength,
    is_active: lora.is_active,
    label: lora.label,
    lora_name: lora.lora_name,
    purpose: lora.purpose,
    sort_order: lora.sort_order,
    style_family: lora.style_family,
    tags: lora.tags,
  };
}

function emptyWorkflowDraft(): ImageWorkflowInput {
  return {
    checkpoint_field_name: 'ckpt_name',
    checkpoint_node_id: null,
    is_active: true,
    key: '',
    label: '',
    load_image_field_name: 'image',
    load_image_node_id: null,
    lora_bindings: [],
    lora_clip_strength_field_name: null,
    lora_model_strength_field_name: 'strength_model',
    lora_name_field_name: 'lora_name',
    lora_node_id: null,
    generation_params_json: null,
    mode: 'create',
    model_ids: [],
    negative_prompt_field_name: 'prompt',
    negative_prompt_node_id: null,
    prompt_field_name: 'text',
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
    load_image_field_name: workflow.load_image_field_name,
    load_image_node_id: workflow.load_image_node_id,
    lora_bindings: workflow.lora_bindings,
    lora_clip_strength_field_name: workflow.lora_clip_strength_field_name,
    lora_model_strength_field_name: workflow.lora_model_strength_field_name,
    lora_name_field_name: workflow.lora_name_field_name,
    lora_node_id: workflow.lora_node_id,
    generation_params_json: workflow.generation_params_json,
    mode: workflow.mode,
    model_ids: workflow.model_ids,
    negative_prompt_field_name: workflow.negative_prompt_field_name,
    negative_prompt_node_id: workflow.negative_prompt_node_id,
    prompt_field_name: workflow.prompt_field_name,
    prompt_node_id: workflow.prompt_node_id,
    sort_order: workflow.sort_order,
    workflow_id: workflow.workflow_id,
  };
}

function workflowSubtitle(workflow: AdminImageWorkflow): string {
  const hash = workflow.contract_hash ? ` · contract ${workflow.contract_hash.slice(0, 8)}` : ' · no contract';
  return `${workflow.mode} · ${workflow.key}${hash}`;
}
