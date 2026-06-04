import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  generateOutfitImage,
  getOutfitImageJob,
  getOutfitRecommendations,
  mediaSource,
} from '@/api/companion-client';
import type {
  ChatOutfitImage,
  MomentImageStatus,
  OutfitRecommendation,
} from '@/api/types';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 120;

type Phase = 'idle' | 'choosing' | 'capturing' | 'ready' | 'error';

type OutfitImageCaptureProps = {
  messageId: string;
  initialOutfit?: ChatOutfitImage | null;
  onOutfitReady?: (outfit: ChatOutfitImage) => void;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalFailure(status: MomentImageStatus): boolean {
  return status === 'failed' || status === 'cancelled';
}

export function OutfitImageCapture({ messageId, initialOutfit, onOutfitReady }: OutfitImageCaptureProps) {
  const initialSucceeded = initialOutfit?.status === 'succeeded' && initialOutfit.output_key;
  const initialPending =
    !!initialOutfit && !initialSucceeded && !isTerminalFailure(initialOutfit.status);

  const [phase, setPhase] = useState<Phase>(() => {
    if (initialSucceeded) return 'ready';
    if (initialOutfit && isTerminalFailure(initialOutfit.status)) return 'error';
    if (initialPending) return 'capturing';
    return 'idle';
  });
  const [outputKey, setOutputKey] = useState<string | null>(initialOutfit?.output_key ?? null);
  const [recommendations, setRecommendations] = useState<OutfitRecommendation[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const activeRef = useRef(true);
  const onOutfitReadyRef = useRef(onOutfitReady);

  useEffect(() => {
    onOutfitReadyRef.current = onOutfitReady;
  }, [onOutfitReady]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  function markReady(jobId: string, key: string) {
    setOutputKey(key);
    setPhase('ready');
    onOutfitReadyRef.current?.({ job_id: jobId, output_key: key, status: 'succeeded' });
  }

  async function poll(jobId: string) {
    for (let i = 0; i < MAX_POLLS; i += 1) {
      if (!activeRef.current) return;
      let res;
      try {
        res = await getOutfitImageJob(jobId);
      } catch {
        if (activeRef.current) setPhase('error');
        return;
      }
      if (res.status === 'succeeded' && res.output_key) {
        if (activeRef.current) {
          markReady(res.job_id || jobId, res.output_key);
        }
        return;
      }
      if (isTerminalFailure(res.status)) {
        if (activeRef.current) setPhase('error');
        return;
      }
      await delay(POLL_INTERVAL_MS);
    }
    if (activeRef.current) setPhase('error');
  }

  useEffect(() => {
    if (initialPending && initialOutfit) {
      void poll(initialOutfit.job_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openChooser() {
    setPhase('choosing');
    if (recommendations.length > 0 || isLoadingRecommendations) return;
    setIsLoadingRecommendations(true);
    try {
      const res = await getOutfitRecommendations(messageId);
      if (!activeRef.current) return;
      setRecommendations(res.recommendations);
      setSelectedRecommendationId(res.recommendations[0]?.id ?? null);
    } catch {
      if (activeRef.current) {
        setRecommendations([]);
      }
    } finally {
      if (activeRef.current) setIsLoadingRecommendations(false);
    }
  }

  async function generate() {
    const trimmed = customPrompt.trim();
    const input = trimmed
      ? { prompt: trimmed, source: 'custom' as const }
      : selectedRecommendationId
        ? { recommendation_id: selectedRecommendationId, source: 'recommended' as const }
        : null;
    if (!input) return;

    setPhase('capturing');
    try {
      const res = await generateOutfitImage(messageId, input);
      if (!activeRef.current) return;
      if (res.status === 'succeeded' && res.output_key) {
        markReady(res.job_id, res.output_key);
        return;
      }
      if (isTerminalFailure(res.status)) {
        setPhase('error');
        return;
      }
      await poll(res.job_id);
    } catch {
      if (activeRef.current) setPhase('error');
    }
  }

  if (phase === 'ready' && outputKey) {
    const source = mediaSource(outputKey);
    if (!source) return null;
    return (
      <View className="w-full px-4 pb-2 pt-1">
        <View className="max-w-[80%] self-start overflow-hidden rounded-2xl border border-app-line bg-app-card">
          <Image accessibilityLabel="Changed outfit" resizeMode="cover" source={source} style={styles.image} />
        </View>
      </View>
    );
  }

  if (phase === 'choosing') {
    const canGenerate = customPrompt.trim().length > 0 || selectedRecommendationId !== null;
    return (
      <View className="w-full px-4 pb-2 pt-0.5">
        <View className="max-w-[88%] gap-2 rounded-2xl border border-app-line bg-app-card p-3">
          <View className="flex-row flex-wrap gap-2">
            {isLoadingRecommendations ? (
              <ActivityIndicator color="#1E6B52" size="small" />
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
                  className={`rounded-full border px-3 py-1.5 ${
                    selected ? 'border-app-brand bg-app-brand-soft' : 'border-app-line bg-app-bg'
                  }`}
                >
                  <Text className="text-xs font-semibold text-app-primary">{item.title}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            accessibilityLabel="Custom outfit prompt"
            onChangeText={(text) => {
              setCustomPrompt(text);
              if (text.trim()) setSelectedRecommendationId(null);
            }}
            placeholder="Custom outfit..."
            placeholderTextColor="rgba(255,255,255,0.40)"
            value={customPrompt}
            className="min-h-10 rounded-xl border border-app-line bg-app-bg px-3 py-2 text-sm text-app-primary"
          />
          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              disabled={!canGenerate}
              onPress={() => void generate()}
              className={`flex-row items-center gap-1.5 rounded-full bg-app-brand px-3 py-1.5 ${
                canGenerate ? 'opacity-100' : 'opacity-50'
              }`}
            >
              <Ionicons color="#FFFFFF" name="shirt-outline" size={15} />
              <Text className="text-xs font-semibold text-white">Generate</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPhase('idle')}
              className="rounded-full border border-app-line px-3 py-1.5"
            >
              <Text className="text-xs font-semibold text-app-muted">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const label =
    phase === 'capturing' ? 'Changing...' : phase === 'error' ? 'Try again' : 'Change outfit';

  return (
    <View className="w-full px-4 pb-2 pt-0.5">
      <Pressable
        accessibilityLabel="Change outfit"
        accessibilityRole="button"
        disabled={phase === 'capturing'}
        onPress={() => {
          if (phase === 'error') {
            void openChooser();
          } else if (phase === 'idle') {
            void openChooser();
          }
        }}
        className={`flex-row items-center gap-1.5 self-start rounded-full border border-app-brand/25 bg-app-brand-soft px-3 py-1.5 ${
          phase === 'capturing' ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {phase === 'capturing' ? (
          <ActivityIndicator color="#1E6B52" size="small" />
        ) : (
          <Ionicons color="#1E6B52" name="shirt-outline" size={16} />
        )}
        <Text className="text-xs font-medium text-app-primary">{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    aspectRatio: 1.5,
    width: '100%',
  },
});
