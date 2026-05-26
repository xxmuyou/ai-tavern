import { useCallback, useState } from 'react';

import {
  cancelActivity,
  completeActivity,
  createActivity,
  getActivity,
} from '@/api/companion-client';
import type { ActivityContext, ActivityCreateInput } from '@/api/types';

export function useActivity(activityId?: string | null) {
  const [activity, setActivity] = useState<ActivityContext | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!activityId) return;
    setIsLoading(true);
    setError(null);
    try {
      const payload = await getActivity(activityId);
      setActivity(payload.activity);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error('Activity could not be loaded.'));
    } finally {
      setIsLoading(false);
    }
  }, [activityId]);

  return { activity, error, isLoading, refresh, setActivity };
}

export function useActivities() {
  const [isMutating, setIsMutating] = useState(false);

  const start = useCallback(async (input: ActivityCreateInput) => {
    setIsMutating(true);
    try {
      return await createActivity(input);
    } finally {
      setIsMutating(false);
    }
  }, []);

  const complete = useCallback(async (activityId: string) => {
    setIsMutating(true);
    try {
      return await completeActivity(activityId);
    } finally {
      setIsMutating(false);
    }
  }, []);

  const cancel = useCallback(async (activityId: string) => {
    setIsMutating(true);
    try {
      return await cancelActivity(activityId);
    } finally {
      setIsMutating(false);
    }
  }, []);

  return { cancel, complete, isMutating, start };
}
