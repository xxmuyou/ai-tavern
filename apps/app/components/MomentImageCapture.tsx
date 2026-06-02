import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { generateMomentImage, getMomentImageJob, mediaSource } from '@/api/companion-client';
import type { ChatMomentImage, MomentImageStatus } from '@/api/types';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 120;

type Phase = 'idle' | 'capturing' | 'ready' | 'error';

type MomentImageCaptureProps = {
  messageId: string;
  initialMoment?: ChatMomentImage | null;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalFailure(status: MomentImageStatus): boolean {
  return status === 'failed' || status === 'cancelled';
}

/**
 * spec-027 — capture a "moment image" from a companion reply. Rendered under
 * every companion message bubble. When the message carries scene context it
 * becomes a full-scene image; otherwise it falls back to a private-chat moment
 * (the backend allows a null scene_id).
 */
export function MomentImageCapture({ messageId, initialMoment }: MomentImageCaptureProps) {
  const initialSucceeded = initialMoment?.status === 'succeeded' && initialMoment.output_key;
  const initialPending =
    !!initialMoment && !initialSucceeded && !isTerminalFailure(initialMoment.status);

  const [phase, setPhase] = useState<Phase>(() => {
    if (initialSucceeded) return 'ready';
    if (initialMoment && isTerminalFailure(initialMoment.status)) return 'error';
    if (initialPending) return 'capturing';
    return 'idle';
  });
  const [outputKey, setOutputKey] = useState<string | null>(initialMoment?.output_key ?? null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  async function poll(jobId: string) {
    for (let i = 0; i < MAX_POLLS; i += 1) {
      if (!activeRef.current) return;
      let res;
      try {
        res = await getMomentImageJob(jobId);
      } catch {
        if (activeRef.current) setPhase('error');
        return;
      }
      if (res.status === 'succeeded' && res.output_key) {
        if (activeRef.current) {
          setOutputKey(res.output_key);
          setPhase('ready');
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

  // Resume polling for a moment that was already in flight when history loaded.
  useEffect(() => {
    if (initialPending && initialMoment) {
      void poll(initialMoment.job_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function capture() {
    setPhase('capturing');
    try {
      const res = await generateMomentImage(messageId);
      if (!activeRef.current) return;
      if (res.status === 'succeeded' && res.output_key) {
        setOutputKey(res.output_key);
        setPhase('ready');
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
          <Image accessibilityLabel="Captured moment" resizeMode="cover" source={source} style={styles.image} />
        </View>
      </View>
    );
  }

  const label =
    phase === 'capturing' ? 'Capturing…' : phase === 'error' ? 'Try again' : 'Capture this moment';

  return (
    <View className="w-full px-4 pb-2 pt-0.5">
      <Pressable
        accessibilityLabel="Capture this moment"
        accessibilityRole="button"
        disabled={phase === 'capturing'}
        onPress={() => void capture()}
        className={`flex-row items-center gap-1.5 self-start rounded-full border border-app-brand/25 bg-app-brand-soft px-3 py-1.5 ${
          phase === 'capturing' ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {phase === 'capturing' ? (
          <ActivityIndicator color="#1E6B52" size="small" />
        ) : (
          <Ionicons color="#1E6B52" name="camera-outline" size={16} />
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
