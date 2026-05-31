import { useEffect, useRef } from 'react';

import { generateCompanionEmotionArt, listCompanionEmotionArtJobs } from '@/api/companion-client';
import type { ChatEmotionKey, CompanionSource, NonNeutralChatEmotionKey } from '@/api/types';

const NON_NEUTRAL_EMOTIONS: ReadonlySet<string> = new Set([
  'annoyed',
  'guarded',
  'playful',
  'tense',
  'warm',
]);
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 60;

type UseEmotionArtArgs = {
  artEmotions: Partial<Record<ChatEmotionKey, string>> | null | undefined;
  artUrl: string | null | undefined;
  companionId: string;
  emotion: string | null | undefined;
  onReady: (emotion: NonNeutralChatEmotionKey, key: string) => void;
  source: CompanionSource | null | undefined;
};

function isNonNeutralEmotion(value: string | null | undefined): value is NonNeutralChatEmotionKey {
  return typeof value === 'string' && NON_NEUTRAL_EMOTIONS.has(value);
}

export function useOnDemandEmotionArt({
  artEmotions,
  artUrl,
  companionId,
  emotion,
  onReady,
  source,
}: UseEmotionArtArgs): void {
  const attemptedRef = useRef(new Set<string>());
  const existingKey = isNonNeutralEmotion(emotion) ? artEmotions?.[emotion] : undefined;

  useEffect(() => {
    if (!companionId || source !== 'user' || !artUrl || !isNonNeutralEmotion(emotion) || existingKey) {
      return;
    }

    const attemptKey = `${companionId}:${emotion}:${artUrl}`;
    if (attemptedRef.current.has(attemptKey)) {
      return;
    }
    attemptedRef.current.add(attemptKey);

    let cancelled = false;
    let timeout: ReturnType<typeof globalThis.setTimeout> | null = null;

    const poll = async (jobId: string, remaining: number): Promise<void> => {
      if (cancelled || remaining <= 0) return;
      try {
        const payload = await listCompanionEmotionArtJobs(companionId);
        const job = payload.jobs.find((item) => item.id === jobId);
        if (job?.status === 'succeeded' && job.output_key) {
          onReady(emotion, job.output_key);
          return;
        }
        if (job?.status === 'failed' || job?.status === 'cancelled') {
          return;
        }
      } catch {
        return;
      }

      timeout = globalThis.setTimeout(() => {
        void poll(jobId, remaining - 1);
      }, POLL_INTERVAL_MS);
    };

    const start = async (): Promise<void> => {
      try {
        const result = await generateCompanionEmotionArt(companionId, emotion);
        if (cancelled) return;
        if (result.status === 'cached') {
          onReady(emotion, result.key);
          return;
        }
        await poll(result.job_id, MAX_POLLS);
      } catch {
        // Missing WF2 config or provider failures should not interrupt chat.
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (timeout) globalThis.clearTimeout(timeout);
    };
  }, [artUrl, companionId, emotion, existingKey, onReady, source]);
}
