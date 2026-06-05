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
  onMomentReady?: (moment: ChatMomentImage) => void;
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
export function MomentImageCapture({ messageId, initialMoment, onMomentReady }: MomentImageCaptureProps) {
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeRef = useRef(true);
  const onMomentReadyRef = useRef(onMomentReady);
  const pollingJobRef = useRef<string | null>(null);

  useEffect(() => {
    onMomentReadyRef.current = onMomentReady;
  }, [onMomentReady]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  function markReady(jobId: string, key: string) {
    setOutputKey(key);
    setErrorMessage(null);
    setPhase('ready');
    onMomentReadyRef.current?.({ job_id: jobId, output_key: key, status: 'succeeded' });
  }

  function markError(message?: string | null) {
    setErrorMessage(message?.trim() || 'Moment capture could not finish. Try again.');
    setPhase('error');
  }

  async function poll(jobId: string) {
    if (pollingJobRef.current === jobId) return;
    pollingJobRef.current = jobId;
    for (let i = 0; i < MAX_POLLS; i += 1) {
      if (!activeRef.current || pollingJobRef.current !== jobId) return;
      let res;
      try {
        res = await getMomentImageJob(jobId);
      } catch (error) {
        if (activeRef.current && pollingJobRef.current === jobId) {
          markError(error instanceof Error ? error.message : 'Could not check the capture job.');
        }
        pollingJobRef.current = null;
        return;
      }
      if (res.status === 'succeeded' && res.output_key) {
        if (activeRef.current && pollingJobRef.current === jobId) {
          markReady(res.job_id || jobId, res.output_key);
        }
        pollingJobRef.current = null;
        return;
      }
      if (isTerminalFailure(res.status)) {
        if (activeRef.current && pollingJobRef.current === jobId) markError(res.error_message ?? res.error_code);
        pollingJobRef.current = null;
        return;
      }
      await delay(POLL_INTERVAL_MS);
    }
    if (activeRef.current && pollingJobRef.current === jobId) markError('Moment capture timed out.');
    pollingJobRef.current = null;
  }

  // Resume or sync a moment that is already in flight when history loads or refreshes.
  useEffect(() => {
    if (!initialMoment) {
      if (phase !== 'capturing') {
        setOutputKey(null);
        setErrorMessage(null);
        setPhase('idle');
      }
      return;
    }
    if (initialMoment.status === 'succeeded' && initialMoment.output_key) {
      pollingJobRef.current = null;
      markReady(initialMoment.job_id, initialMoment.output_key);
      return;
    }
    if (isTerminalFailure(initialMoment.status)) {
      pollingJobRef.current = null;
      markError();
      return;
    }
    setOutputKey(initialMoment.output_key ?? null);
    setErrorMessage(null);
    setPhase('capturing');
    void poll(initialMoment.job_id);
    // This effect is keyed only by server-provided moment identity/status. The
    // local helpers intentionally stay stable through refs/state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMoment?.job_id, initialMoment?.output_key, initialMoment?.status]);

  async function capture() {
    pollingJobRef.current = null;
    setErrorMessage(null);
    setPhase('capturing');
    try {
      const res = await generateMomentImage(messageId);
      if (!activeRef.current) return;
      if (res.status === 'succeeded' && res.output_key) {
        markReady(res.job_id, res.output_key);
        return;
      }
      if (isTerminalFailure(res.status)) {
        markError(res.error_message ?? res.error_code);
        return;
      }
      await poll(res.job_id);
    } catch (error) {
      if (activeRef.current) {
        markError(error instanceof Error ? error.message : 'Could not start the capture job.');
      }
    }
  }

  if (phase === 'ready' && outputKey) {
    const source = mediaSource(outputKey);
    if (!source) return null;
    return (
      <View className="w-full px-4 pb-2 pt-1">
        <View className="max-w-[80%] self-start overflow-hidden rounded-2xl border border-app-line bg-app-card">
          <Image
            accessibilityLabel="Captured moment"
            onError={() => markError('Captured image could not be loaded from storage.')}
            resizeMode="cover"
            source={source}
            style={styles.image}
          />
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
      {phase === 'error' && errorMessage ? (
        <Text className="mt-1 max-w-[80%] text-xs font-medium text-ember">{errorMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    aspectRatio: 1.5,
    width: '100%',
  },
});
