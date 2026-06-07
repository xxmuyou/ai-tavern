import { useCallback, useEffect, useMemo, useState } from 'react';

import { listEvents, resolveEvent } from '@/api/companion-client';
import type { EventResponseItem, EventResolveResponse } from '@/api/types';

export function usePendingEvents(initialEvent?: EventResponseItem | null) {
  const [events, setEvents] = useState<EventResponseItem[]>([]);
  const [result, setResult] = useState<EventResolveResponse | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const current = events[0] ?? null;

  const enqueue = useCallback((items: EventResponseItem[]) => {
    setEvents((previous) => {
      const byId = new Map<string, EventResponseItem>();
      for (const item of [...items, ...previous]) {
        byId.set(item.id, item);
      }
      return [...byId.values()];
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pending = await listEvents('pending');
        if (!cancelled) {
          enqueue([
            ...(initialEvent ? [initialEvent] : []),
            ...pending.events.filter((event) => event.id !== initialEvent?.id),
          ]);
        }
      } catch {
        if (!cancelled && initialEvent) enqueue([initialEvent]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enqueue, initialEvent]);

  const resolve = useCallback(async (event: EventResponseItem, optionId: string) => {
    setIsResolving(true);
    try {
      const next = await resolveEvent(event.id, optionId);
      setResult(next);
      return next;
    } finally {
      setIsResolving(false);
    }
  }, []);

  const close = useCallback(() => {
    setResult(null);
    setEvents((previous) => previous.slice(1));
  }, []);

  return useMemo(
    () => ({ close, current, isResolving, resolve, result, visible: current !== null }),
    [close, current, isResolving, resolve, result],
  );
}
