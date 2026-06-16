import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import {
  clearCompanionProfileImage,
  generateProfileOutfitImage,
  getLatestProfileOutfitImage,
  getProfileOutfitImageJob,
  getProfileOutfitRecommendations,
  mediaSource,
  setCompanionProfileImage,
  uploadCompanionArt,
} from '@/api/companion-client';
import type { MomentImageStatus, OutfitRecommendation } from '@/api/types';
import { WebButton, WebCard } from '@/components/web/ui';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 120;

type Phase = 'idle' | 'choosing' | 'generating' | 'ready' | 'applying' | 'error';

type ProfileOutfitPanelProps = {
  companionId: string;
  density?: 'default' | 'compact';
  hasOverride: boolean;
  name: string;
  onChanged: () => Promise<unknown> | void;
  onError?: (message: string) => void;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalFailure(status: MomentImageStatus): boolean {
  return status === 'failed' || status === 'cancelled';
}

function messageForError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ProfileOutfitPanel({
  companionId,
  density = 'default',
  hasOverride,
  name,
  onChanged,
  onError,
}: ProfileOutfitPanelProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [recommendations, setRecommendations] = useState<OutfitRecommendation[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [outputKey, setOutputKey] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function resumeLatest() {
      try {
        const payload = await getLatestProfileOutfitImage(companionId);
        const generation = payload.generation;
        if (cancelled || !activeRef.current || !generation) return;
        setPhase('generating');
        setGenerationId(generation.generation_id ?? null);
        setOutputKey(generation.output_key ?? null);
        if (generation.status === 'succeeded' && generation.output_key) {
          markReady(generation.job_id, generation.generation_id ?? null, generation.output_key);
          return;
        }
        if (isTerminalFailure(generation.status)) {
          setPhase('error');
          return;
        }
        await poll(generation.job_id, generation.generation_id ?? null);
      } catch {
        // Resume is best-effort; opening the chooser still works.
      }
    }
    void resumeLatest();
    return () => {
      cancelled = true;
    };
    // Resume only when the companion changes; poll/markReady use stable state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionId]);

  async function openChooser() {
    setPhase('choosing');
    if (recommendations.length > 0 || isLoadingRecommendations) return;
    setIsLoadingRecommendations(true);
    try {
      const payload = await getProfileOutfitRecommendations(companionId);
      if (!activeRef.current) return;
      setRecommendations(payload.recommendations);
      setSelectedRecommendationId(payload.recommendations[0]?.id ?? null);
    } catch {
      if (activeRef.current) onError?.('Could not load outfit suggestions.');
    } finally {
      if (activeRef.current) setIsLoadingRecommendations(false);
    }
  }

  function markReady(nextJobId: string, nextGenerationId: string | null, nextOutputKey: string) {
    if (nextGenerationId) setGenerationId(nextGenerationId);
    setOutputKey(nextOutputKey);
    setPhase('ready');
  }

  async function poll(nextJobId: string, fallbackGenerationId: string | null) {
    for (let i = 0; i < MAX_POLLS; i += 1) {
      if (!activeRef.current) return;
      let payload;
      try {
        payload = await getProfileOutfitImageJob(nextJobId);
      } catch {
        if (activeRef.current) setPhase('error');
        return;
      }
      if (payload.status === 'succeeded' && payload.output_key) {
        if (activeRef.current) markReady(payload.job_id || nextJobId, payload.generation_id ?? fallbackGenerationId, payload.output_key);
        return;
      }
      if (isTerminalFailure(payload.status)) {
        if (activeRef.current) setPhase('error');
        return;
      }
      await delay(POLL_INTERVAL_MS);
    }
    if (activeRef.current) setPhase('error');
  }

  async function generate() {
    const trimmed = customPrompt.trim();
    const input = trimmed
      ? { prompt: trimmed, source: 'custom' as const }
      : selectedRecommendationId
        ? { recommendation_id: selectedRecommendationId, source: 'recommended' as const }
        : null;
    if (!input) return;

    setPhase('generating');
    setOutputKey(null);
    setGenerationId(null);
    try {
      const payload = await generateProfileOutfitImage(companionId, input);
      if (!activeRef.current) return;
      setGenerationId(payload.generation_id ?? null);
      if (payload.status === 'succeeded' && payload.output_key) {
        markReady(payload.job_id, payload.generation_id ?? null, payload.output_key);
        return;
      }
      if (isTerminalFailure(payload.status)) {
        setPhase('error');
        return;
      }
      await poll(payload.job_id, payload.generation_id ?? null);
    } catch (error) {
      if (activeRef.current) {
        setPhase('error');
        onError?.(messageForError(error, 'Could not generate that outfit.'));
      }
    }
  }

  async function applyGeneratedImage() {
    if (!generationId) return;
    setPhase('applying');
    try {
      await setCompanionProfileImage(companionId, generationId);
      await onChanged();
      if (activeRef.current) setPhase('idle');
    } catch (error) {
      if (activeRef.current) {
        setPhase('ready');
        onError?.(messageForError(error, 'Could not apply this profile image.'));
      }
    }
  }

  async function uploadProfileImage() {
    setIsUploading(true);
    try {
      const file = await selectImageFile();
      if (!file) return;
      const uploaded = await uploadCompanionArt(file);
      await setCompanionProfileImage(companionId, { art_key: uploaded.key });
      await onChanged();
      if (activeRef.current) setPhase('idle');
    } catch (error) {
      onError?.(messageForError(error, 'Could not upload this profile image.'));
    } finally {
      if (activeRef.current) setIsUploading(false);
    }
  }

  async function resetProfileImage() {
    try {
      await clearCompanionProfileImage(companionId);
      await onChanged();
    } catch {
      onError?.('Could not reset the profile image.');
    }
  }

  const previewSource = mediaSource(outputKey);
  const canGenerate = customPrompt.trim().length > 0 || selectedRecommendationId !== null;
  const isCompact = density === 'compact';

  return (
    <WebCard padding={isCompact ? 'sm' : 'md'} className="gap-4 border-white/12 bg-[#1B0F22]">
      <View className="gap-3">
        <View className="min-w-0">
          <Text className="text-overline text-rose-200">Profile image</Text>
          <Text className="mt-1 text-body-sm text-rose-50/75">Upload your own image, or generate a new outfit for {name}.</Text>
        </View>
        <View className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <WebButton
            className="w-full"
            label={isUploading ? 'Uploading…' : 'Upload image'}
            isLoading={isUploading}
            onPress={() => void uploadProfileImage()}
            variant="outline"
            iconLeft={<Ionicons color={PALETTE.roseDeep} name="image-outline" size={16} />}
            disabled={phase === 'generating' || phase === 'applying'}
          />
          <WebButton
            className="w-full"
            label={phase === 'generating' ? 'Generating…' : 'Change outfit'}
            isLoading={phase === 'generating'}
            onPress={() => void openChooser()}
            variant="primary"
            iconLeft={<Ionicons color={PALETTE.roseDeep} name="shirt-outline" size={16} />}
            disabled={isUploading}
          />
        </View>
      </View>

      {phase === 'choosing' || phase === 'generating' || phase === 'ready' || phase === 'applying' || phase === 'error' ? (
        <View className="gap-3 rounded-2xl border border-white/12 bg-[#21142A] p-3">
          <View className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {isLoadingRecommendations ? (
              <ActivityIndicator color={PALETTE.roseDeep} size="small" />
            ) : recommendations.map((item) => {
              const selected = selectedRecommendationId === item.id && customPrompt.trim().length === 0;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  onPress={() => {
                    setCustomPrompt('');
                    setSelectedRecommendationId(item.id);
                  }}
                  className={`min-h-10 justify-center rounded-xl border px-3 py-2 ${
                    selected ? 'border-app-rose/70 bg-app-canvas/70' : 'border-white/15 bg-[#2A1934]'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${selected ? 'text-app-rose-deep' : 'text-rose-50/75'}`}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            accessibilityLabel="Custom profile outfit prompt"
            onChangeText={(text) => {
              setCustomPrompt(text);
              if (text.trim()) setSelectedRecommendationId(null);
            }}
            placeholder="Custom outfit..."
            placeholderTextColor={PALETTE.muted}
            value={customPrompt}
            className="min-h-10 rounded-xl border border-white/15 bg-[#130A18] px-3 py-2 text-sm text-white"
          />

          {previewSource ? (
            <View
              className={`overflow-hidden rounded-2xl border border-white/12 bg-[#130A18] ${isCompact ? 'self-center' : ''}`}
              style={isCompact ? styles.previewFrameCompact : undefined}
            >
              <Image accessibilityLabel="Generated profile outfit preview" resizeMode="cover" source={previewSource} style={styles.preview} />
            </View>
          ) : null}

          {phase === 'error' ? (
            <Text className="text-caption font-semibold text-app-ember">Generation failed. Try another outfit prompt.</Text>
          ) : null}

          {outputKey ? (
            <View className="gap-2">
              <WebButton
                className="w-full"
                label={phase === 'applying' ? 'Applying…' : 'Use as profile image'}
                isLoading={phase === 'applying'}
                onPress={() => void applyGeneratedImage()}
                variant="primary"
                disabled={!generationId}
              />
              <View className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <WebButton
                  className="w-full"
                  label={phase === 'generating' ? 'Generating…' : 'Regenerate'}
                  isLoading={phase === 'generating'}
                  onPress={() => void generate()}
                  variant="outline"
                  disabled={!canGenerate || phase === 'generating' || phase === 'applying'}
                />
                <WebButton className="w-full" label="Close" onPress={() => setPhase('idle')} variant="ghost" />
              </View>
            </View>
          ) : (
            <View className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <WebButton
                className="w-full"
                label={phase === 'generating' ? 'Generating…' : 'Generate'}
                isLoading={phase === 'generating'}
                onPress={() => void generate()}
                variant="outline"
                disabled={!canGenerate || phase === 'generating' || phase === 'applying'}
              />
              <WebButton className="w-full" label="Close" onPress={() => setPhase('idle')} variant="ghost" />
            </View>
          )}
        </View>
      ) : null}

      {hasOverride ? (
        <Pressable accessibilityRole="button" onPress={() => void resetProfileImage()} className="self-start">
          <Text className="text-caption font-semibold text-rose-50/70">Reset to original profile image</Text>
        </Pressable>
      ) : null}
    </WebCard>
  );
}

const styles = StyleSheet.create({
  preview: {
    aspectRatio: 4 / 5,
    width: '100%',
  },
  previewFrameCompact: {
    maxWidth: 280,
    width: '100%',
  },
});

function selectImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
