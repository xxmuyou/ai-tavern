import { useCallback, useEffect, useState } from 'react';

import { fetchImageModels, type ImageModelOption } from '@/api/companion-client';

/**
 * Loads the active WF1 model catalog for the create form's model picker.
 */
export function useImageModels() {
  const [models, setModels] = useState<ImageModelOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setModels(await fetchImageModels());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load models.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { models, isLoading, error, reload: load } as const;
}
