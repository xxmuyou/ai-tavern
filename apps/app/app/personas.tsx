import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import { createPersona, deletePersona, updatePersona } from '@/api/companion-client';
import type { Persona } from '@/api/types';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { usePersonas } from '@/hooks/use-personas';

type Draft = {
  id: string | null;
  name: string;
  gender: string;
  description: string;
  isDefault: boolean;
};

const EMPTY_DRAFT: Draft = { description: '', gender: '', id: null, isDefault: false, name: '' };

export default function PersonasScreen() {
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
    try {
      await updatePersona(persona.id, { is_default: true, name: persona.name });
      await refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not update persona.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return <LoadingScreen label="Loading personas..." />;
  }

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showBack title="Your personas" />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-3xl gap-4 px-4 py-6">
          <Text className="text-sm text-app-muted">
            A persona is who you play as in chat. Characters use it to know who they are talking to — your name, who
            you are, and how they should treat you. The default persona is used in every conversation unless you pick
            another.
          </Text>

          {saveError ? (
            <View className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <Text className="text-sm font-medium text-red-800">{saveError}</Text>
            </View>
          ) : null}

          {draft ? (
            <View className="gap-3 rounded-lg border border-app-line bg-app-card p-4 web:bg-app-surface">
              <Text className="text-base font-semibold text-app-text">
                {draft.id ? 'Edit persona' : 'New persona'}
              </Text>
              <Field
                label="Name"
                placeholder="e.g. Alex, Dr. Wen, your real name"
                value={draft.name}
                onChangeText={(name) => setDraft((d) => (d ? { ...d, name } : d))}
              />
              <Field
                label="Gender (optional)"
                placeholder="e.g. female, male, non-binary"
                value={draft.gender}
                onChangeText={(gender) => setDraft((d) => (d ? { ...d, gender } : d))}
              />
              <Field
                label="About you (optional)"
                placeholder="A short description of who you are: your vibe, background, how you carry yourself."
                multiline
                value={draft.description}
                onChangeText={(description) => setDraft((d) => (d ? { ...d, description } : d))}
              />
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: draft.isDefault }}
                onPress={() => setDraft((d) => (d ? { ...d, isDefault: !d.isDefault } : d))}
                className="flex-row items-center gap-2"
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded border ${
                    draft.isDefault ? 'border-app-primary bg-app-primary' : 'border-app-line bg-app-surface'
                  }`}
                >
                  {draft.isDefault ? <Text className="text-xs font-bold text-white">✓</Text> : null}
                </View>
                <Text className="text-sm text-app-text">Use as my default persona</Text>
              </Pressable>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button label="Cancel" variant="secondary" disabled={busy} onPress={() => setDraft(null)} />
                </View>
                <View className="flex-1">
                  <Button label="Save" isLoading={busy} onPress={save} />
                </View>
              </View>
            </View>
          ) : (
            <Button label="New persona" onPress={startCreate} />
          )}

          {error && !data ? (
            <EmptyState
              actionLabel="Try again"
              description="Personas could not be loaded."
              onAction={refetch}
              title="Unavailable"
            />
          ) : personas.length === 0 && !draft ? (
            <EmptyState
              description="Create a persona so characters know who they are talking to."
              title="No personas yet"
            />
          ) : (
            personas.map((persona) => (
              <View
                key={persona.id}
                className="gap-2 rounded-lg border border-app-line bg-app-card p-4 web:bg-app-surface"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="text-base font-semibold text-app-text">{persona.name}</Text>
                  {persona.is_default ? (
                    <View className="rounded-full border border-app-primary/25 bg-app-primarySoft px-2 py-0.5">
                      <Text className="text-xs font-semibold text-app-primary">Default</Text>
                    </View>
                  ) : null}
                </View>
                {persona.gender ? <Text className="text-xs text-app-muted">{persona.gender}</Text> : null}
                {persona.description ? (
                  <Text className="text-sm text-app-text">{persona.description}</Text>
                ) : null}
                <View className="mt-1 flex-row flex-wrap gap-3">
                  {!persona.is_default ? (
                    <Pressable disabled={busy} onPress={() => makeDefault(persona)}>
                      <Text className="text-sm font-semibold text-app-primary">Set default</Text>
                    </Pressable>
                  ) : null}
                  <Pressable disabled={busy} onPress={() => startEdit(persona)}>
                    <Text className="text-sm font-semibold text-app-primary">Edit</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => remove(persona)}>
                    <Text className="text-sm font-semibold text-app-danger">Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  multiline,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <View>
      <Text className="mb-2 text-sm font-semibold text-app-text">{label}</Text>
      <TextInput
        className={`rounded-lg border border-app-line bg-app-sunken px-3 py-3 text-base text-app-text ${
          multiline ? 'min-h-24' : ''
        }`}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PALETTE.muted}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}
