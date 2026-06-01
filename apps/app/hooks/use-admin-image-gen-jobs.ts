import { useCallback, useEffect, useState } from 'react';

import { listAdminImageGenJobs } from '@/api/companion-client';
import type { AdminImageGenJob } from '@/api/types';

/**
 * Read-only diagnostics hook for the admin workspace: lists recent image
 * generation jobs (defaults to failures) so admins can see the real provider
 * error_message instead of a generic "generation failed".
 */
export function useAdminImageGenJobs(status: string | null = 'failed', limit = 50) {
  const [jobs, setJobs] = useState<AdminImageGenJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listAdminImageGenJobs({ status: status ?? undefined, limit });
      setJobs(data.jobs);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load jobs.');
    } finally {
      setIsLoading(false);
    }
  }, [status, limit]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { jobs, isLoading, error, reload } as const;
}
