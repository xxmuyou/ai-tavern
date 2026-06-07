import { useEffect, useMemo, useRef } from 'react';

import { getMomentImageJob } from '@/api/companion-client';
import type { ChatMessage, ChatMomentImage, MomentImageStatus } from '@/api/types';

const POLL_INTERVAL_MS = 2500;

function isPending(status: MomentImageStatus): boolean {
  return status !== 'succeeded' && status !== 'failed' && status !== 'cancelled';
}

type UsePendingMomentImagesInput = {
  messages: ChatMessage[];
  onUpdate: (messageId: string, moment: ChatMomentImage) => void;
};

/**
 * Keeps chat moment image jobs moving even when the per-message capture button
 * unmounts due to page switches, history refreshes, or list virtualization.
 */
export function usePendingMomentImages({ messages, onUpdate }: UsePendingMomentImagesInput) {
  const onUpdateRef = useRef(onUpdate);
  const inFlightRef = useRef(new Set<string>());

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const pending = useMemo(
    () =>
      messages
        .map((message) => ({ messageId: message.id, moment: message.moment_image ?? null }))
        .filter((item): item is { messageId: string; moment: ChatMomentImage } =>
          Boolean(item.moment?.job_id && isPending(item.moment.status)),
        ),
    [messages],
  );

  useEffect(() => {
    if (pending.length === 0) return;
    let cancelled = false;

    async function tick() {
      await Promise.all(
        pending.map(async ({ messageId, moment }) => {
          const jobId = moment.job_id;
          if (inFlightRef.current.has(jobId)) return;
          inFlightRef.current.add(jobId);
          try {
            const res = await getMomentImageJob(jobId);
            if (!cancelled) {
              onUpdateRef.current(messageId, {
                job_id: res.job_id || jobId,
                output_key: res.output_key ?? null,
                status: res.status,
              });
            }
          } catch {
            // The per-message component still owns user-facing errors. This
            // background observer is only a best-effort continuity bridge.
          } finally {
            inFlightRef.current.delete(jobId);
          }
        }),
      );
    }

    void tick();
    const id = globalThis.setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      globalThis.clearInterval(id);
    };
  }, [pending]);
}
