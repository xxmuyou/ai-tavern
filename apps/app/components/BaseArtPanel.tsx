import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { generateBaseArt, getBaseArtJob, mediaSource } from '@/api/companion-client';
import type { ArtStyle } from '@/api/types';
import { Button } from '@/components/Button';

type Phase = 'idle' | 'generating' | 'preview' | 'error';

const STYLES: { id: ArtStyle; label: string; enabled: boolean }[] = [
  { enabled: false, id: 'realistic', label: 'Realistic' },
  { enabled: false, id: 'anime_jp', label: 'Anime (JP)' },
  { enabled: true, id: 'anime_kr', label: 'Manhwa (KR)' },
];

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 120;

type BaseArtPanelProps = {
  onConfirm: (artKey: string, style: ArtStyle) => void;
};

/**
 * spec-022 WF-1 create — step 1 of companion creation: pick a style, enter a
 * prompt, generate a base portrait, preview, then confirm to carry it into the
 * character form. Shared by the web and native create screens.
 */
export function BaseArtPanel({ onConfirm }: BaseArtPanelProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [style, setStyle] = useState<ArtStyle>('anime_kr');
  const [prompt, setPrompt] = useState('');
  const [artKey, setArtKey] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  async function pollJob(jobId: string) {
    for (let i = 0; i < MAX_POLLS; i += 1) {
      if (!activeRef.current) return;
      const res = await getBaseArtJob(jobId);
      if (res.status === 'succeeded' && res.art_key) {
        if (activeRef.current) {
          setArtKey(res.art_key);
          setPhase('preview');
        }
        return;
      }
      if (res.status === 'failed' || res.status === 'cancelled') {
        if (activeRef.current) {
          setErrorCode(res.error_code ?? 'generation_failed');
          setPhase('error');
        }
        return;
      }
      await delay(POLL_INTERVAL_MS);
    }
    if (activeRef.current) {
      setErrorCode('timeout');
      setPhase('error');
    }
  }

  async function generate() {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setErrorCode('prompt_required');
      setPhase('error');
      return;
    }
    setPhase('generating');
    setErrorCode(null);
    setArtKey(null);
    try {
      const { job_id } = await generateBaseArt({ prompt: trimmed, source: 'text', style });
      await pollJob(job_id);
    } catch {
      if (activeRef.current) {
        setErrorCode('request_failed');
        setPhase('error');
      }
    }
  }

  const previewSource = artKey ? mediaSource(artKey) : null;
  const isGenerating = phase === 'generating';

  return (
    <View className="mx-auto w-full max-w-2xl gap-5 px-4 py-6">
      <View className="gap-4 rounded-lg border border-app-line bg-app-card p-5 web:bg-white">
        <Text className="text-lg font-semibold text-app-text">1. Choose a style</Text>
        <View className="flex-row flex-wrap gap-2">
          {STYLES.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              disabled={!item.enabled || isGenerating}
              onPress={() => setStyle(item.id)}
              className={`rounded-full border px-3 py-2 ${
                style === item.id ? 'border-app-primary bg-app-primary' : 'border-app-line bg-white'
              } ${item.enabled ? 'opacity-100' : 'opacity-40'}`}
            >
              <Text className={`text-sm font-semibold ${style === item.id ? 'text-white' : 'text-app-muted'}`}>
                {item.label}
                {item.enabled ? '' : ' · soon'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mt-2 text-lg font-semibold text-app-text">2. Describe the portrait</Text>
        <TextInput
          className="min-h-24 rounded-lg border border-app-line bg-white px-3 py-3 text-base text-app-text"
          editable={!isGenerating}
          multiline
          onChangeText={setPrompt}
          placeholder="A gentle young woman with long dark hair, soft smile, casual sweater..."
          placeholderTextColor="#687076"
          textAlignVertical="top"
          value={prompt}
        />

        {phase === 'error' ? (
          <Text className="text-sm font-semibold text-app-danger">{errorLabel(errorCode)}</Text>
        ) : null}

        <Button
          isLoading={isGenerating}
          label={artKey ? 'Generate again' : 'Generate portrait'}
          onPress={() => void generate()}
        />
      </View>

      {isGenerating ? (
        <View className="items-center gap-3 rounded-lg border border-app-line bg-app-card p-8 web:bg-white">
          <ActivityIndicator color="#1E6B52" />
          <Text className="text-sm text-app-muted">Generating portrait... this can take up to a minute.</Text>
        </View>
      ) : null}

      {phase === 'preview' && previewSource ? (
        <View className="gap-4 rounded-lg border border-app-line bg-app-card p-5 web:bg-white">
          <Text className="text-lg font-semibold text-app-text">3. Preview</Text>
          <View className="items-center overflow-hidden rounded-lg border border-app-line bg-app-primarySoft">
            <Image accessibilityLabel="Generated portrait" resizeMode="contain" source={previewSource} style={styles.preview} />
          </View>
          <Button label="Use this portrait" onPress={() => artKey && onConfirm(artKey, style)} />
          <Button label="Regenerate" onPress={() => void generate()} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

function errorLabel(code: string | null): string {
  switch (code) {
    case 'prompt_required':
      return 'Enter a description first.';
    case 'timeout':
      return 'Generation timed out. Please try again.';
    case 'request_failed':
      return 'Could not start generation. Please try again.';
    default:
      return 'Generation failed. Please try again.';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
  preview: {
    aspectRatio: 0.7,
    height: undefined,
    width: '100%',
  },
});
