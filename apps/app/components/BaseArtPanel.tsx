import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { generateBaseArt, getBaseArtJob, mediaSource } from '@/api/companion-client';
import { useImageModels } from '@/hooks/use-image-models';
import { Button } from '@/components/Button';

type Phase = 'idle' | 'generating' | 'preview' | 'error';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 120;

type BaseArtPanelProps = {
  onConfirm: (artKey: string, modelId: string) => void;
};

/**
 * spec-022 WF-1 create — step 1 of companion creation: pick a model, enter a
 * prompt, generate a base portrait, preview, then confirm to carry it into the
 * character form. The model catalog is admin-managed; each model carries its
 * own style tag. Shared by the web and native create screens.
 */
export function BaseArtPanel({ onConfirm }: BaseArtPanelProps) {
  const { models, isLoading: modelsLoading } = useImageModels();
  const [phase, setPhase] = useState<Phase>('idle');
  const [model, setModel] = useState<string | null>(null);
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

  useEffect(() => {
    if (!model && models.length > 0) {
      setModel(models[0].id);
    }
  }, [model, models]);

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
    if (!model) {
      setErrorCode('model_required');
      setPhase('error');
      return;
    }
    setPhase('generating');
    setErrorCode(null);
    setArtKey(null);
    try {
      const { job_id } = await generateBaseArt({ prompt: trimmed, source: 'text', model });
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
        <Text className="text-lg font-semibold text-app-text">1. Choose a model</Text>
        <View className="flex-row flex-wrap gap-2">
          {modelsLoading ? <Text className="text-sm text-app-muted">Loading models…</Text> : null}
          {!modelsLoading && models.length === 0 ? (
            <Text className="text-sm text-app-danger">No models configured.</Text>
          ) : null}
          {models.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              disabled={isGenerating}
              onPress={() => setModel(item.id)}
              className={`rounded-full border px-3 py-2 ${
                model === item.id ? 'border-app-primary bg-app-primary' : 'border-app-line bg-white'
              }`}
            >
              <Text className={`text-sm font-semibold ${model === item.id ? 'text-white' : 'text-app-muted'}`}>
                {item.label}
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
          disabled={!model}
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
          <Button label="Use this portrait" onPress={() => artKey && model && onConfirm(artKey, model)} />
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
    case 'model_required':
      return 'Pick a model first.';
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
