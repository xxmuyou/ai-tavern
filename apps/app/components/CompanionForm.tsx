import { useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { CompanionCreateInput, CompanionDetail, Gender, Scene } from '@/api/types';
import { Button } from '@/components/Button';

const ROLES = ['friend', 'crush', 'stranger', 'colleague', 'neighbor', 'family'] as const;

type CompanionFormValues = {
  appearance: string;
  art_url: string;
  background: string;
  gender: Gender;
  name: string;
  personality: string;
  preferred_scenes: string[];
  relationship_role: string;
  speech_style: string;
};

type CompanionFormProps = {
  initial?: CompanionDetail | null;
  isSubmitting?: boolean;
  mode: 'create' | 'edit';
  onPickArt: () => Promise<string | null>;
  onSubmit: (input: CompanionCreateInput) => Promise<void>;
  scenes?: Scene[];
};

export function CompanionForm({ initial, isSubmitting, mode, onPickArt, onSubmit, scenes = [] }: CompanionFormProps) {
  const [values, setValues] = useCompanionFormValues(initial);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickArt() {
    setError(null);
    setIsUploading(true);
    try {
      const key = await onPickArt();
      if (key) {
        setValues((current) => ({ ...current, art_url: key }));
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Portrait upload failed.');
    } finally {
      setIsUploading(false);
    }
  }

  async function submit() {
    setError(null);
    const name = values.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    if (!values.art_url) {
      setError('Upload a portrait before creating this companion.');
      return;
    }

    await onSubmit({
      appearance: cleanText(values.appearance),
      art_url: values.art_url,
      background: cleanText(values.background),
      gender: values.gender,
      name,
      personality: cleanText(values.personality),
      preferred_scenes: values.preferred_scenes,
      relationship_role: cleanText(values.relationship_role),
      speech_style: cleanText(values.speech_style),
    });
  }

  const imageSource = mediaSource(values.art_url);
  const submitLabel = mode === 'create' ? 'Create companion' : 'Save changes';

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
      <View className="mx-auto w-full max-w-5xl gap-5 px-4 py-6 web:grid web:grid-cols-[minmax(240px,320px)_1fr] web:px-0 web:py-0">
        <View className="rounded-lg border border-app-line bg-app-card p-4 web:bg-white">
          <Pressable
            accessibilityRole="button"
            disabled={isUploading}
            onPress={() => void pickArt()}
            className="aspect-[4/5] items-center justify-end overflow-hidden rounded-lg border border-dashed border-app-line bg-app-primarySoft"
          >
            <View pointerEvents="none" style={styles.portraitFloor} />
            {imageSource ? (
              <Image accessibilityLabel={values.name || 'Companion portrait'} resizeMode="contain" source={imageSource} style={styles.portraitImage} />
            ) : (
              <View className="h-full w-full items-center justify-center px-4">
                <Text className="text-center text-base font-semibold text-app-primary">
                  {isUploading ? 'Uploading portrait...' : 'Upload portrait'}
                </Text>
                <Text className="mt-2 text-center text-xs text-app-muted">PNG, JPG, or WebP up to 5MB</Text>
              </View>
            )}
          </Pressable>
          {imageSource ? (
            <Button disabled={isUploading} isLoading={isUploading} label="Replace portrait" onPress={() => void pickArt()} variant="secondary" />
          ) : null}
        </View>

        <View className="gap-5">
          <FormPanel title="Core profile">
            <Field
              label="Name"
              onChangeText={(name) => setValues((current) => ({ ...current, name }))}
              placeholder="Echo"
              value={values.name}
            />

            <View>
              <Text className="mb-2 text-sm font-semibold text-app-text">Gender</Text>
              <View className="flex-row gap-2">
                {(['female', 'male'] as const).map((gender) => (
                  <Choice
                    key={gender}
                    active={values.gender === gender}
                    label={gender === 'female' ? 'Female' : 'Male'}
                    onPress={() => setValues((current) => ({ ...current, gender }))}
                  />
                ))}
              </View>
            </View>

            <View>
              <Text className="mb-2 text-sm font-semibold text-app-text">Relationship role</Text>
              <View className="flex-row flex-wrap gap-2">
                {ROLES.map((role) => (
                  <Choice
                    key={role}
                    active={values.relationship_role === role}
                    label={role}
                    onPress={() => setValues((current) => ({ ...current, relationship_role: role }))}
                  />
                ))}
              </View>
            </View>
          </FormPanel>

          <FormPanel title="Character card">
            <Field
              label="Personality"
              multiline
              onChangeText={(personality) => setValues((current) => ({ ...current, personality }))}
              placeholder="Warm, direct, protective..."
              value={values.personality}
            />
            <Field
              label="Appearance"
              multiline
              onChangeText={(appearance) => setValues((current) => ({ ...current, appearance }))}
              placeholder="What they look like, styling, presence..."
              value={values.appearance}
            />
            <Field
              label="Background"
              multiline
              onChangeText={(background) => setValues((current) => ({ ...current, background }))}
              placeholder="Their history, goals, contradictions..."
              value={values.background}
            />
            <Field
              label="Speech style"
              multiline
              onChangeText={(speech_style) => setValues((current) => ({ ...current, speech_style }))}
              placeholder="How they talk, pacing, favorite phrases..."
              value={values.speech_style}
            />
          </FormPanel>

          {scenes.length ? (
            <FormPanel title="Preferred scenes">
              <View className="flex-row flex-wrap gap-2">
                {scenes.map((scene) => {
                  const active = values.preferred_scenes.includes(scene.id);
                  return (
                    <Choice
                      key={scene.id}
                      active={active}
                      label={scene.name}
                      onPress={() => {
                        setValues((current) => ({
                          ...current,
                          preferred_scenes: active
                            ? current.preferred_scenes.filter((id) => id !== scene.id)
                            : [...current.preferred_scenes, scene.id],
                        }));
                      }}
                    />
                  );
                })}
              </View>
            </FormPanel>
          ) : null}

          {error ? <Text className="text-sm font-semibold text-app-danger">{error}</Text> : null}
          <Button disabled={isUploading} isLoading={isSubmitting} label={submitLabel} onPress={() => void submit()} />
        </View>
      </View>
    </ScrollView>
  );
}

function useCompanionFormValues(initial?: CompanionDetail | null) {
  const [values, setValues] = useState<CompanionFormValues>(() => initialValues(initial));

  useEffect(() => {
    setValues(initialValues(initial));
  }, [initial]);

  return [values, setValues] as const;
}

function initialValues(initial?: CompanionDetail | null): CompanionFormValues {
  return {
    appearance: initial?.appearance ?? '',
    art_url: initial?.art_url ?? '',
    background: initial?.background ?? '',
    gender: initial?.gender ?? 'female',
    name: initial?.name ?? '',
    personality: initial?.personality ?? '',
    preferred_scenes: initial?.preferred_scenes ?? [],
    relationship_role: initial?.relationship_role ?? 'friend',
    speech_style: initial?.speech_style ?? '',
  };
}

function cleanText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function FormPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View className="gap-4 rounded-lg border border-app-line bg-app-card p-5 web:bg-white">
      <Text className="text-lg font-semibold text-app-text">{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View>
      <Text className="mb-2 text-sm font-semibold text-app-text">{label}</Text>
      <TextInput
        className={`rounded-lg border border-app-line bg-white px-3 py-3 text-base text-app-text ${
          multiline ? 'min-h-24 text-top' : ''
        }`}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#687076"
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`rounded-full border px-3 py-2 ${active ? 'border-app-primary bg-app-primary' : 'border-app-line bg-white'}`}
    >
      <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-app-muted'}`}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  portraitFloor: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    bottom: 0,
    height: 58,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  portraitImage: {
    height: '108%',
    transform: [{ translateY: 10 }],
    width: '108%',
  },
});
