import { useCallback, useEffect, useState } from 'react';

import { fetchImageModels, type ImageModelOption } from '@/api/companion-client';
import type { ImageStylePreset } from '@/api/types';

/**
 * Loads the active portrait create model catalog for the create form's model picker.
 */
export function useImageModels() {
  const [models, setModels] = useState<ImageModelOption[]>([]);
  const [stylePresets, setStylePresets] = useState<ImageStylePreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchImageModels();
      setModels(data.models ?? []);
      setStylePresets(data.style_presets ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load models.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { models, stylePresets, isLoading, error, reload: load } as const;
}
