import { useCallback, useEffect, useState } from 'react';

import {
  createAdminImageModel,
  deleteAdminImageModel,
  listAdminImageModels,
  updateAdminImageModel,
} from '@/api/companion-client';
import type { AdminImageModel, ImageModelInput } from '@/api/types';

export function useAdminImageModels() {
  const [models, setModels] = useState<AdminImageModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listAdminImageModels();
      setModels(data.models);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load models.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: ImageModelInput) => {
      await createAdminImageModel(input);
      await reload();
    },
    [reload],
  );

  const update = useCallback(
    async (id: string, input: ImageModelInput) => {
      await updateAdminImageModel(id, input);
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteAdminImageModel(id);
      await reload();
    },
    [reload],
  );

  return { models, isLoading, error, reload, create, update, remove } as const;
}
