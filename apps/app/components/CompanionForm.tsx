import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getVoiceOptions, getVoicePreview, mediaSource } from '@/api/companion-client';
import type { CompanionCreateInput, CompanionDetail, Gender, Scene, VoiceOption, VoiceOptionsResponse, VoiceSpeed } from '@/api/types';
import { AppDropdown } from '@/components/AppDropdown';
import { Button } from '@/components/Button';
import { playAudioUrl } from '@/utils/play-audio';

const ROLES = ['friend', 'crush', 'stranger', 'colleague', 'neighbor', 'family'] as const;
const PERSONALITY_PRESETS = ['warm', 'reserved', 'playful', 'protective', 'ambitious', 'mysterious'];
const SPEECH_STYLE_PRESETS = ['soft-spoken', 'direct', 'teasing', 'formal', 'poetic'];
const WANT_PRESETS = ['to be understood', 'to feel safe', 'to be taken seriously', 'to find excitement'];
const BOUNDARY_PRESETS = ['being lied to', 'being rushed', 'being ignored', 'being treated as a backup'];

type CompanionFormValues = {
  appearance: string;
  art_url: string;
  background: string;
  boundary: string;
  example_dialogues: string;
  gender: Gender;
  greeting: string;
  name: string;
  personality: string;
  preferred_scenes: string[];
  relationship_role: string;
  secret: string;
  speech_style: string;
  tags: string;
  voice_id: string;
  voice_speed: VoiceSpeed;
  want: string;
};

type CompanionFormProps = {
  initial?: CompanionDetail | null;
  initialArtUrl?: string;
  isSubmitting?: boolean;
  mode: 'create' | 'edit';
  onPickArt: () => Promise<string | null>;
  onSubmit: (input: CompanionCreateInput) => Promise<void>;
  scenes?: Scene[];
};

export function CompanionForm({ initial, initialArtUrl, isSubmitting, mode, onPickArt, onSubmit, scenes = [] }: CompanionFormProps) {
  const [values, setValues] = useCompanionFormValues(initial, initialArtUrl);
  const [voiceOptions, setVoiceOptions] = useState<VoiceOptionsResponse | null>(null);
  const [voiceRegion, setVoiceRegion] = useState<string>('zh-mandarin');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVoiceOptions()
      .then((options) => {
        if (cancelled) return;
        setVoiceOptions(options);
        const initialVoiceId = initial?.voice_id || defaultVoiceId(options, initial?.gender ?? 'female');
        setVoiceRegion(languageForVoice(options.voices, initialVoiceId) ?? 'zh-mandarin');
        setValues((current) => {
          const voiceId = current.voice_id || defaultVoiceId(options, current.gender);
          return { ...current, voice_id: voiceId, voice_speed: current.voice_speed || options.defaults.speed };
        });
      })
      .catch(() => {
        if (!cancelled) setVoiceOptions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [initial, setValues]);

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
      boundary: cleanText(values.boundary),
      example_dialogues: parseLines(values.example_dialogues),
      gender: values.gender,
      greeting: cleanText(values.greeting),
      name,
      personality: cleanText(values.personality),
      preferred_scenes: values.preferred_scenes,
      relationship_role: cleanText(values.relationship_role),
      secret: cleanText(values.secret),
      speech_style: cleanText(values.speech_style),
      tags: parseTags(values.tags),
      voice_id: values.voice_id || undefined,
      voice_speed: values.voice_speed,
      want: cleanText(values.want),
    });
  }

  const imageSource = mediaSource(values.art_url);
  const submitLabel = mode === 'create' ? 'Create companion' : 'Save changes';

  function changeGender(gender: Gender) {
    const voiceId = voiceOptions
      ? recommendedVoiceForLanguage(voiceOptions.voices, voiceRegion, gender)?.id ?? defaultVoiceId(voiceOptions, gender)
      : defaultVoiceId(voiceOptions, gender);
    setValues((current) => ({ ...current, gender, voice_id: voiceId }));
  }

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
                    onPress={() => changeGender(gender)}
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
            <PresetField
              label="Personality"
              multiline
              onChangeText={(personality) => setValues((current) => ({ ...current, personality }))}
              placeholder="Warm, direct, protective..."
              presets={PERSONALITY_PRESETS}
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
            <PresetField
              label="Speech style"
              multiline
              onChangeText={(speech_style) => setValues((current) => ({ ...current, speech_style }))}
              placeholder="How they talk, pacing, favorite phrases..."
              presets={SPEECH_STYLE_PRESETS}
              value={values.speech_style}
            />
          </FormPanel>

          <FormPanel title="Opening & voice">
            {voiceOptions ? (
              <VoicePicker
                gender={values.gender}
                language={voiceRegion}
                onChangeGender={changeGender}
                onChangeLanguage={(language) => {
                  setVoiceRegion(language);
                  const voice = recommendedVoiceForLanguage(voiceOptions.voices, language, values.gender);
                  if (voice) setValues((current) => ({ ...current, voice_id: voice.id }));
                }}
                onChangeSpeed={(voice_speed) => setValues((current) => ({ ...current, voice_speed }))}
                onChangeVoice={(voice_id) => setValues((current) => ({ ...current, voice_id }))}
                options={voiceOptions}
                selectedSpeed={values.voice_speed}
                selectedVoiceId={values.voice_id}
              />
            ) : null}
            <Field
              hint="The first thing they say when a new chat begins."
              label="Greeting"
              multiline
              onChangeText={(greeting) => setValues((current) => ({ ...current, greeting }))}
              placeholder="Oh — you're here. I wasn't sure you'd come."
              value={values.greeting}
            />
            <Field
              hint="One example line per row. Anchors their voice — they won't be quoted verbatim."
              label="Example lines"
              multiline
              onChangeText={(example_dialogues) => setValues((current) => ({ ...current, example_dialogues }))}
              placeholder={'Don\'t make it weird.\nI saved you the window seat. Obviously.'}
              value={values.example_dialogues}
            />
            <Field
              hint="Comma-separated. Used for search and discovery."
              label="Tags"
              onChangeText={(tags) => setValues((current) => ({ ...current, tags }))}
              placeholder="tsundere, childhood friend, sci-fi"
              value={values.tags}
            />
          </FormPanel>

          <FormPanel title="Inner life">
            <PresetField
              hint="What they're after right now — colours how they engage."
              label="Want"
              multiline
              onChangeText={(want) => setValues((current) => ({ ...current, want }))}
              placeholder="To be taken seriously, to not be rushed..."
              presets={WANT_PRESETS}
              value={values.want}
            />
            <Field
              hint="Revealed only once the relationship earns enough trust."
              label="Secret"
              multiline
              onChangeText={(secret) => setValues((current) => ({ ...current, secret }))}
              placeholder="A soft spot or past hurt they keep hidden..."
              value={values.secret}
            />
            <PresetField
              hint="Crossing it makes them guarded, cold, or distant."
              label="Boundary"
              multiline
              onChangeText={(boundary) => setValues((current) => ({ ...current, boundary }))}
              placeholder="Being pushed, lied to, treated as a backup..."
              presets={BOUNDARY_PRESETS}
              value={values.boundary}
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

function useCompanionFormValues(initial?: CompanionDetail | null, initialArtUrl?: string) {
  const [values, setValues] = useState<CompanionFormValues>(() => initialValues(initial, initialArtUrl));

  useEffect(() => {
    setValues(initialValues(initial, initialArtUrl));
  }, [initial, initialArtUrl]);

  return [values, setValues] as const;
}

function initialValues(initial?: CompanionDetail | null, initialArtUrl?: string): CompanionFormValues {
  return {
    appearance: initial?.appearance ?? '',
    art_url: initial?.art_url ?? initialArtUrl ?? '',
    background: initial?.background ?? '',
    boundary: initial?.boundary ?? '',
    example_dialogues: (initial?.example_dialogues ?? []).join('\n'),
    gender: initial?.gender ?? 'female',
    greeting: initial?.greeting ?? '',
    name: initial?.name ?? '',
    personality: initial?.personality ?? '',
    preferred_scenes: initial?.preferred_scenes ?? [],
    relationship_role: initial?.relationship_role ?? 'friend',
    secret: initial?.secret ?? '',
    speech_style: initial?.speech_style ?? '',
    tags: (initial?.tags ?? []).join(', '),
    voice_id: initial?.voice_id ?? '',
    voice_speed: initial?.voice_speed ?? 'medium',
    want: initial?.want ?? '',
  };
}

function defaultVoiceId(options: VoiceOptionsResponse | null, gender: Gender): string {
  if (!options) return gender === 'male' ? 'male-qn-qingse' : 'Arrogant_Miss';
  return gender === 'male' ? options.defaults.male_voice_id : options.defaults.female_voice_id;
}

function languageForVoice(voices: VoiceOption[], voiceId: string): string | null {
  return voices.find((voice) => voice.id === voiceId)?.language ?? null;
}

function languageChoices(voices: VoiceOption[]): { id: string; label: string }[] {
  const seen = new Set<string>();
  const choices: { id: string; label: string }[] = [];
  for (const voice of voices) {
    if (seen.has(voice.language)) continue;
    seen.add(voice.language);
    choices.push({ id: voice.language, label: voiceLanguageDisplayLabel(voice) });
  }
  return choices;
}

function sortedVoices(voices: VoiceOption[], gender: Gender): VoiceOption[] {
  const rank = (voice: VoiceOption) => {
    if (voice.gender_hint === gender) return 0;
    if (voice.gender_hint === 'neutral' || !voice.gender_hint) return 1;
    return 2;
  };
  return [...voices].sort((a, b) => rank(a) - rank(b) || voiceDisplayLabel(a).localeCompare(voiceDisplayLabel(b)));
}

function recommendedVoiceForLanguage(voices: VoiceOption[], language: string, gender: Gender): VoiceOption | undefined {
  return sortedVoices(
    voices.filter((voice) => voice.language === language),
    gender,
  )[0];
}

function voiceDisplayLabel(voice: VoiceOption): string {
  return voice.display_label ?? voice.label;
}

function voiceLanguageDisplayLabel(voice: VoiceOption): string {
  return voice.display_language_label ?? voice.language_label;
}

function VoicePicker({
  gender,
  language,
  onChangeGender,
  onChangeLanguage,
  onChangeSpeed,
  onChangeVoice,
  options,
  selectedSpeed,
  selectedVoiceId,
}: {
  gender: Gender;
  language: string;
  onChangeGender: (gender: Gender) => void;
  onChangeLanguage: (language: string) => void;
  onChangeSpeed: (speed: VoiceSpeed) => void;
  onChangeVoice: (voiceId: string) => void;
  options: VoiceOptionsResponse;
  selectedSpeed: VoiceSpeed;
  selectedVoiceId: string;
}) {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const languages = languageChoices(options.voices);
  const voices = sortedVoices(
    options.voices.filter((voice) => voice.language === language),
    gender,
  );
  const genderOptions: { label: string; value: Gender }[] = [
    { label: 'Female', value: 'female' },
    { label: 'Male', value: 'male' },
  ];
  const speedLabels = new Map(options.speed_presets.map((preset) => [preset.id, preset.label]));
  const voiceById = new Map(options.voices.map((voice) => [voice.id, voice]));
  const selectedVoice = voiceById.get(selectedVoiceId);

  async function previewVoice() {
    if (!selectedVoiceId || isPreviewing) return;
    setPreviewError(null);
    setIsPreviewing(true);
    try {
      const preview = await getVoicePreview(selectedVoiceId);
      await playAudioUrl(preview.url);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Voice preview failed.');
    } finally {
      setIsPreviewing(false);
    }
  }

  return (
    <View className="gap-4">
      <View className="gap-3 web:grid web:grid-cols-3">
        <View>
          <Text className="mb-2 text-sm font-semibold text-app-text">Gender</Text>
          <AppDropdown<Gender>
            labelForValue={(value) => genderOptions.find((option) => option.value === value)?.label ?? 'Select gender'}
            onChange={onChangeGender}
            options={genderOptions}
            value={gender}
          />
        </View>

        <View>
          <Text className="mb-2 text-sm font-semibold text-app-text">Language/Region</Text>
          <AppDropdown
            labelForValue={(value) => languages.find((option) => option.id === value)?.label ?? 'Select language'}
            onChange={onChangeLanguage}
            options={languages.map((item) => ({ label: item.label, value: item.id }))}
            value={language}
          />
        </View>

        <View>
          <Text className="mb-2 text-sm font-semibold text-app-text">Voice</Text>
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <AppDropdown
                labelForValue={(value) => {
                  const voice = voiceById.get(value);
                  return voice ? voiceDisplayLabel(voice) : 'Select voice';
                }}
                onChange={onChangeVoice}
                options={voices.map((voice) => ({ label: voiceDisplayLabel(voice), value: voice.id }))}
                value={selectedVoiceId}
              />
            </View>
            <Pressable
              accessibilityLabel={isPreviewing ? 'Loading voice preview' : 'Preview voice'}
              accessibilityRole="button"
              disabled={!selectedVoice || isPreviewing}
              onPress={() => void previewVoice()}
              className={`h-9 w-9 items-center justify-center rounded-lg border ${
                selectedVoice && !isPreviewing ? 'border-rose bg-rose-soft' : 'border-app-line bg-app-sunken'
              }`}
            >
              <Ionicons color={selectedVoice && !isPreviewing ? '#9A2F4F' : '#8A7A82'} name={isPreviewing ? 'hourglass-outline' : 'volume-medium-outline'} size={16} />
            </Pressable>
          </View>
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-semibold text-app-text">Selected voice</Text>
        <Text className="text-xs text-app-muted">
          {selectedVoice ? `${selectedVoice.id} · ${voiceLanguageDisplayLabel(selectedVoice)}` : 'Choose a voice to enable preview.'}
        </Text>
        {previewError ? <Text className="mt-1 text-xs font-semibold text-red-600">{previewError}</Text> : null}
      </View>

      <View>
        <Text className="mb-2 text-sm font-semibold text-app-text">Speed</Text>
        <View className="flex-row flex-wrap gap-2">
          {options.speed_presets.map((preset) => (
            <Choice
              key={preset.id}
              active={selectedSpeed === preset.id}
              label={speedLabels.get(preset.id) ?? preset.label}
              onPress={() => onChangeSpeed(preset.id)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function cleanText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 32);
}

function parseTags(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 16);
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
  hint,
  label,
  multiline,
  inputRef,
  onChangeText,
  placeholder,
  value,
}: {
  hint?: string;
  inputRef?: RefObject<TextInput | null>;
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View>
      {label ? <Text className="mb-2 text-sm font-semibold text-app-text">{label}</Text> : null}
      {hint ? <Text className="mb-2 -mt-1 text-xs text-app-muted">{hint}</Text> : null}
      <TextInput
        ref={inputRef}
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

function PresetField({
  hint,
  label,
  multiline,
  onChangeText,
  placeholder,
  presets,
  value,
}: {
  hint?: string;
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  presets: string[];
  value: string;
}) {
  const inputRef = useRef<TextInput | null>(null);

  function applyPreset(preset: string) {
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.includes(preset)) {
      onChangeText([...parts, preset].join(', '));
    }
  }

  return (
    <View>
      <Text className="mb-2 text-sm font-semibold text-app-text">{label}</Text>
      {hint ? <Text className="mb-2 -mt-1 text-xs text-app-muted">{hint}</Text> : null}
      <View className="mb-3 flex-row flex-wrap gap-2">
        {presets.map((preset) => (
          <Choice key={preset} active={hasPreset(value, preset)} label={preset} onPress={() => applyPreset(preset)} />
        ))}
        <Choice active={false} label="Other" onPress={() => inputRef.current?.focus()} />
      </View>
      <Field
        inputRef={inputRef}
        label=""
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        value={value}
      />
    </View>
  );
}

function hasPreset(value: string, preset: string): boolean {
  return value
    .split(',')
    .map((part) => part.trim())
    .includes(preset);
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
