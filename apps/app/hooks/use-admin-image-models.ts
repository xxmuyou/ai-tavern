import { useCallback, useEffect, useState } from 'react';

import {
  createAdminImageLora,
  createAdminImageModel,
  createAdminImageWorkflow,
  deleteAdminImageLora,
  deleteAdminImageModel,
  deleteAdminImageWorkflow,
  listAdminImageLoras,
  listAdminImageModels,
  listAdminImageWorkflows,
  updateAdminImageLora,
  updateAdminImageModel,
  updateAdminImageWorkflow,
} from '@/api/companion-client';
import type { AdminImageLora, AdminImageModel, AdminImageWorkflow, ImageLoraInput, ImageModelInput, ImageWorkflowInput } from '@/api/types';

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

export function useAdminImageLoras() {
  const [loras, setLoras] = useState<AdminImageLora[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listAdminImageLoras();
      setLoras(data.loras);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load LoRAs.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: ImageLoraInput) => {
      await createAdminImageLora(input);
      await reload();
    },
    [reload],
  );

  const update = useCallback(
    async (id: string, input: ImageLoraInput) => {
      await updateAdminImageLora(id, input);
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteAdminImageLora(id);
      await reload();
    },
    [reload],
  );

  return { loras, isLoading, error, reload, create, update, remove } as const;
}

export function useAdminImageWorkflows() {
  const [workflows, setWorkflows] = useState<AdminImageWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listAdminImageWorkflows();
      setWorkflows(data.workflows);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load workflows.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: ImageWorkflowInput) => {
      await createAdminImageWorkflow(input);
      await reload();
    },
    [reload],
  );

  const update = useCallback(
    async (key: string, input: ImageWorkflowInput) => {
      await updateAdminImageWorkflow(key, input);
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (key: string) => {
      await deleteAdminImageWorkflow(key);
      await reload();
    },
    [reload],
  );

  return { workflows, isLoading, error, reload, create, update, remove } as const;
}
