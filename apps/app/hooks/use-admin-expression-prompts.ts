import { useCallback, useEffect, useState } from 'react';

import {
  listAdminExpressionPrompts,
  updateAdminExpressionPrompt,
} from '@/api/companion-client';
import type { ExpressionGender, ExpressionPromptItem } from '@/api/types';

export function useAdminExpressionPrompts() {
  const [prompts, setPrompts] = useState<ExpressionPromptItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listAdminExpressionPrompts();
      setPrompts(data.prompts);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load prompts.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (gender: ExpressionGender, emotion: string, prompt: string) => {
      await updateAdminExpressionPrompt(gender, emotion, prompt);
      await reload();
    },
    [reload],
  );

  return { prompts, isLoading, error, reload, save } as const;
}
