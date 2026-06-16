import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { createPersona, deletePersona, updatePersona } from '@/api/companion-client';
import type { Persona } from '@/api/types';
import { WebAppShell } from '@/components/web/WebAppShell';
import {
  WebButton,
  WebCard,
  WebEmptyState,
  WebInput,
  WebLoading,
  WebSection,
  WebTag,
  WebTextarea,
} from '@/components/web/ui';
import { ME_ROUTE } from '@/constants/routes';
import { PALETTE } from '@/constants/palette';
import { usePersonas } from '@/hooks/use-personas';

type Draft = {
  id: string | null;
  name: string;
  gender: string;
  description: string;
  isDefault: boolean;
};

const EMPTY_DRAFT: Draft = { description: '', gender: '', id: null, isDefault: false, name: '' };

export default function WebPersonasScreen() {
  const { data, error, isLoading, refetch } = usePersonas();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const personas = data?.personas ?? [];

  const startCreate = () => {
    setSaveError(null);
    setDraft({ ...EMPTY_DRAFT });
  };

  const startEdit = (persona: Persona) => {
    setSaveError(null);
    setDraft({
      description: persona.description ?? '',
      gender: persona.gender ?? '',
      id: persona.id,
      isDefault: persona.is_default,
      name: persona.name,
    });
  };

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setSaveError('Give your persona a name.');
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      const input = {
        description: draft.description.trim() || null,
        gender: draft.gender.trim() || null,
        is_default: draft.isDefault,
        name,
      };
      if (draft.id) {
        await updatePersona(draft.id, input);
      } else {
        await createPersona(input);
      }
      setDraft(null);
      await refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save persona.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (persona: Persona) => {
    setBusy(true);
    setSaveError(null);
    try {
      await deletePersona(persona.id);
      await refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not delete persona.');
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (persona: Persona) => {
    if (persona.is_default) return;
    setBusy(true);
    setSaveError(null);
    try {
      await updatePersona(persona.id, { is_default: true, name: persona.name });
      await refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not update persona.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <WebAppShell
      breadcrumbs={[{ href: ME_ROUTE, label: 'Me' }, { label: 'Personas' }]}
      title="Personas"
      subtitle="Who you play as in chat."
    >
      <View className="mb-7 flex-row flex-wrap items-end justify-between gap-4">
        <View className="min-w-0 flex-1">
          <Text className="font-serif text-display-sm text-white">Personas</Text>
          <Text className="mt-2 max-w-2xl text-body-sm leading-6 text-rose-50/60">
            Choose who companions are talking to. Your default persona is used unless you pick another in chat.
          </Text>
        </View>
        <WebButton
          disabled={Boolean(draft)}
          iconLeft={<Ionicons color={PALETTE.roseDeep} name="add-outline" size={16} />}
          label="New persona"
          onPress={startCreate}
          variant="primary"
        />
      </View>

      <View className="gap-6">
        {isLoading ? (
          <WebCard>
            <WebLoading fullscreen={false} label="Loading personas..." />
          </WebCard>
        ) : null}

        {saveError ? (
          <WebCard className="border-app-danger/40 bg-app-danger-soft" padding="sm">
            <Text className="text-body-sm font-semibold text-app-danger">{saveError}</Text>
          </WebCard>
        ) : null}

        {draft ? (
          <PersonaEditor
            busy={busy}
            draft={draft}
            onCancel={() => setDraft(null)}
            onChange={setDraft}
            onSave={save}
          />
        ) : null}

        {!isLoading ? (
          <WebSection
            eyebrow="Identity"
            title="Saved personas"
            description="Companions use these details to understand who they are speaking with."
          >
            {error && !data ? (
              <WebEmptyState
                actionLabel="Try again"
                description="Personas could not be loaded."
                icon="warning-outline"
                onAction={refetch}
                title="Unavailable"
              />
            ) : personas.length === 0 && !draft ? (
              <WebEmptyState
                actionLabel="New persona"
                description="Create a persona so characters know who they are talking to."
                icon="person-outline"
                onAction={startCreate}
                title="No personas yet"
              />
            ) : (
              <View className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {personas.map((persona) => (
                  <PersonaCard
                    key={persona.id}
                    busy={busy}
                    onEdit={() => startEdit(persona)}
                    onMakeDefault={() => void makeDefault(persona)}
                    onRemove={() => void remove(persona)}
                    persona={persona}
                  />
                ))}
              </View>
            )}
          </WebSection>
        ) : null}
      </View>
    </WebAppShell>
  );
}

function PersonaEditor({
  busy,
  draft,
  onCancel,
  onChange,
  onSave,
}: {
  busy: boolean;
  draft: Draft;
  onCancel: () => void;
  onChange: (draft: Draft) => void;
  onSave: () => void;
}) {
  return (
    <WebCard className="gap-5" padding="lg">
      <View>
        <Text className="font-serif text-title text-white">{draft.id ? 'Edit persona' : 'New persona'}</Text>
        <Text className="mt-1 text-body-sm text-rose-50/60">Keep this short and concrete so companions can use it naturally.</Text>
      </View>
      <View className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WebInput
          label="Name"
          onChangeText={(name) => onChange({ ...draft, name })}
          placeholder="e.g. Alex, Dr. Wen, your real name"
          value={draft.name}
        />
        <WebInput
          label="Gender (optional)"
          onChangeText={(gender) => onChange({ ...draft, gender })}
          placeholder="e.g. female, male, non-binary"
          value={draft.gender}
        />
      </View>
      <WebTextarea
        label="About you (optional)"
        onChangeText={(description) => onChange({ ...draft, description })}
        placeholder="A short description of who you are: your vibe, background, how you carry yourself."
        value={draft.description}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: draft.isDefault }}
        onPress={() => onChange({ ...draft, isDefault: !draft.isDefault })}
        className="flex-row items-center gap-2 self-start rounded-full border border-app-line bg-app-sunken px-3 py-2 hover:border-app-rose/50"
      >
        <View
          className={`h-5 w-5 items-center justify-center rounded border ${
            draft.isDefault ? 'border-app-rose bg-app-rose-soft' : 'border-app-line bg-app-solid-surface'
          }`}
        >
          {draft.isDefault ? <Ionicons color={PALETTE.roseDeep} name="checkmark" size={14} /> : null}
        </View>
        <Text className="text-body-sm font-semibold text-app-ink">Use as my default persona</Text>
      </Pressable>
      <View className="flex-row flex-wrap justify-end gap-3">
        <WebButton disabled={busy} label="Cancel" onPress={onCancel} variant="outline" />
        <WebButton isLoading={busy} label="Save" onPress={onSave} variant="primary" />
      </View>
    </WebCard>
  );
}

function PersonaCard({
  busy,
  onEdit,
  onMakeDefault,
  onRemove,
  persona,
}: {
  busy: boolean;
  onEdit: () => void;
  onMakeDefault: () => void;
  onRemove: () => void;
  persona: Persona;
}) {
  return (
    <WebCard className="gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-serif text-title-sm text-white">
            {persona.name}
          </Text>
          {persona.gender ? <Text className="mt-1 text-caption text-rose-50/60">{persona.gender}</Text> : null}
        </View>
        {persona.is_default ? <WebTag size="sm" variant="rose">Default</WebTag> : null}
      </View>
      {persona.description ? (
        <Text className="text-body-sm leading-6 text-rose-50/75">{persona.description}</Text>
      ) : (
        <Text className="text-body-sm leading-6 text-rose-50/45">No extra description yet.</Text>
      )}
      <View className="mt-auto flex-row flex-wrap gap-2">
        {!persona.is_default ? (
          <WebButton disabled={busy} label="Set default" onPress={onMakeDefault} size="sm" variant="outline" />
        ) : null}
        <WebButton disabled={busy} label="Edit" onPress={onEdit} size="sm" variant="ghost" />
        <WebButton disabled={busy} label="Delete" onPress={onRemove} size="sm" variant="danger" />
      </View>
    </WebCard>
  );
}
