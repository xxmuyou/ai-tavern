import { useCallback, useEffect, useState } from 'react';

import { listAdminImageGenJobs } from '@/api/companion-client';
import type { AdminImageGenJob } from '@/api/types';

export type AdminImageGenJobsQuery = {
  createdFrom?: number;
  createdTo?: number;
  limit?: number;
  status?: string | null;
};

/**
 * Read-only diagnostics hook for the admin workspace: lists image generation
 * jobs in a bounded window so admins can inspect provider failures by day.
 */
export function useAdminImageGenJobs(query: AdminImageGenJobsQuery = {}) {
  const [jobs, setJobs] = useState<AdminImageGenJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { createdFrom, createdTo, limit = 50, status = 'failed' } = query;

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listAdminImageGenJobs({
        createdFrom,
        createdTo,
        limit,
        status: status ?? undefined,
      });
      setJobs(data.jobs);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load jobs.');
    } finally {
      setIsLoading(false);
    }
  }, [createdFrom, createdTo, limit, status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { jobs, isLoading, error, reload } as const;
}
