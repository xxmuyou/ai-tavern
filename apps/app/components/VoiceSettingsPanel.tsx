import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { getVoiceOptions, getVoicePreview } from '@/api/companion-client';
import type { Gender, VoiceOption, VoiceOptionsResponse, VoiceSpeed } from '@/api/types';
import { AppDropdown } from '@/components/AppDropdown';
import { Button } from '@/components/Button';
import { PALETTE } from '@/constants/palette';
import { playAudioUrl } from '@/utils/play-audio';

export type VoiceSettingsValue = {
  voice_id: string;
  voice_speed: VoiceSpeed;
};

export type VoiceSettingsPanelProps = {
  initialGender?: Gender | null;
  initialValue?: VoiceSettingsValue | null;
  isSaving?: boolean;
  onSave: (value: VoiceSettingsValue) => Promise<void> | void;
};

export function VoiceSettingsPanel({ initialGender, initialValue, isSaving, onSave }: VoiceSettingsPanelProps) {
  const [options, setOptions] = useState<VoiceOptionsResponse | null>(null);
  const [gender, setGender] = useState<Gender>(initialGender ?? 'female');
  const [language, setLanguage] = useState('zh-mandarin');
  const [selectedVoiceId, setSelectedVoiceId] = useState(initialValue?.voice_id ?? '');
  const [selectedSpeed, setSelectedSpeed] = useState<VoiceSpeed>(initialValue?.voice_speed ?? 'medium');
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGender(initialGender ?? 'female');
    setSelectedVoiceId(initialValue?.voice_id ?? '');
    setSelectedSpeed(initialValue?.voice_speed ?? 'medium');
  }, [initialGender, initialValue]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getVoiceOptions()
      .then((nextOptions) => {
        if (cancelled) return;
        setOptions(nextOptions);
        const voiceId = initialValue?.voice_id || defaultVoiceId(nextOptions, initialGender ?? 'female');
        setSelectedVoiceId(voiceId);
        setSelectedSpeed(initialValue?.voice_speed ?? nextOptions.defaults.speed);
        setLanguage(languageForVoice(nextOptions.voices, voiceId) ?? 'zh-mandarin');
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError('Voice options could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialGender, initialValue]);

  const languages = useMemo(() => languageChoices(options?.voices ?? []), [options]);
  const voices = useMemo(
    () => sortedVoices((options?.voices ?? []).filter((voice) => voice.language === language), gender),
    [gender, language, options],
  );
  const voiceById = useMemo(() => new Map((options?.voices ?? []).map((voice) => [voice.id, voice])), [options]);
  const selectedVoice = voiceById.get(selectedVoiceId);
  const speedLabels = useMemo(
    () => new Map((options?.speed_presets ?? []).map((preset) => [preset.id, preset.label])),
    [options],
  );

  function changeGender(nextGender: Gender) {
    setGender(nextGender);
    if (!options) return;
    const voice = recommendedVoiceForLanguage(options.voices, language, nextGender);
    setSelectedVoiceId(voice?.id ?? defaultVoiceId(options, nextGender));
  }

  function changeLanguage(nextLanguage: string) {
    setLanguage(nextLanguage);
    if (!options) return;
    const voice = recommendedVoiceForLanguage(options.voices, nextLanguage, gender);
    if (voice) setSelectedVoiceId(voice.id);
  }

  async function previewVoice() {
    if (!selectedVoiceId || isPreviewing) return;
    setError(null);
    setIsPreviewing(true);
    try {
      const preview = await getVoicePreview(selectedVoiceId);
      await playAudioUrl(preview.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice preview failed.');
    } finally {
      setIsPreviewing(false);
    }
  }

  async function save() {
    if (!selectedVoiceId) return;
    setError(null);
    try {
      await onSave({ voice_id: selectedVoiceId, voice_speed: selectedSpeed });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice settings could not be saved.');
    }
  }

  if (isLoading) {
    return (
      <View className="items-center justify-center py-10">
        <ActivityIndicator color={PALETTE.roseDeep} />
      </View>
    );
  }

  if (!options) {
    return (
      <View className="gap-4">
        <Text className="text-sm font-semibold text-app-danger">{error ?? 'Voice options are unavailable.'}</Text>
      </View>
    );
  }

  return (
    <View className="gap-5">
      <View className="gap-3 web:grid web:grid-cols-3">
        <View>
          <Text className="mb-2 text-sm font-semibold text-app-text web:text-rose-50">Gender hint</Text>
          <AppDropdown<Gender>
            labelForValue={(value) => value === 'male' ? 'Male' : 'Female'}
            onChange={changeGender}
            options={[
              { label: 'Female', value: 'female' },
              { label: 'Male', value: 'male' },
            ]}
            value={gender}
          />
        </View>

        <View>
          <Text className="mb-2 text-sm font-semibold text-app-text web:text-rose-50">Language/Region</Text>
          <AppDropdown
            labelForValue={(value) => languages.find((option) => option.id === value)?.label ?? 'Select language'}
            onChange={changeLanguage}
            options={languages.map((item) => ({ label: item.label, value: item.id }))}
            value={language}
          />
        </View>

        <View>
          <Text className="mb-2 text-sm font-semibold text-app-text web:text-rose-50">Voice</Text>
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <AppDropdown
                labelForValue={(value) => voiceById.get(value) ? voiceDisplayLabel(voiceById.get(value)!) : 'Select voice'}
                onChange={setSelectedVoiceId}
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
              <Ionicons color={selectedVoice && !isPreviewing ? PALETTE.roseDeep : PALETTE.muted} name={isPreviewing ? 'hourglass-outline' : 'volume-medium-outline'} size={16} />
            </Pressable>
          </View>
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-semibold text-app-text web:text-rose-50">Speed</Text>
        <View className="flex-row flex-wrap gap-2">
          {options.speed_presets.map((preset) => (
            <Choice
              key={preset.id}
              active={selectedSpeed === preset.id}
              label={speedLabels.get(preset.id) ?? preset.label}
              onPress={() => setSelectedSpeed(preset.id)}
            />
          ))}
        </View>
      </View>

      <View>
        <Text className="mb-1 text-sm font-semibold text-app-text web:text-rose-50">Selected voice</Text>
        <Text className="text-xs text-app-muted web:text-rose-50/65">
          {selectedVoice ? `${selectedVoice.id} · ${voiceLanguageDisplayLabel(selectedVoice)}` : 'Choose a voice to enable preview.'}
        </Text>
        {error ? <Text className="mt-2 text-xs font-semibold text-app-danger">{error}</Text> : null}
      </View>

      <Button disabled={!selectedVoiceId} isLoading={isSaving} label="Save voice settings" onPress={() => void save()} />
    </View>
  );
}

function defaultVoiceId(options: VoiceOptionsResponse, gender: Gender): string {
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

function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`rounded-full border px-3 py-2 ${active ? 'border-app-rose/70 bg-app-canvas/70 web:bg-app-rose-soft/60' : 'border-app-line bg-white web:border-white/15 web:bg-white/[0.04]'}`}
    >
      <Text className={`text-sm font-semibold ${active ? 'text-app-rose-deep' : 'text-app-muted web:text-rose-50/70'}`}>{label}</Text>
    </Pressable>
  );
}
