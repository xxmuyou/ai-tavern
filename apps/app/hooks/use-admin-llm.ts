import { useCallback, useEffect, useState } from 'react';

import { getLlmUsage, listLlmConfig, testLlmCall, updateLlmConfig } from '@/api/companion-client';
import type {
  LlmConfigItem,
  LlmConfigUpdateInput,
  LlmTestInput,
  LlmTestResult,
  LlmUsageResponse,
  LlmUsageWindow,
} from '@/api/types';

import { useErrorBanner } from './use-error-banner';

export function useAdminLlm() {
  const { pushError } = useErrorBanner();
  const [tasks, setTasks] = useState<LlmConfigItem[]>([]);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [savingTask, setSavingTask] = useState<string | null>(null);

  const [testResult, setTestResult] = useState<LlmTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const [usageWindow, setUsageWindow] = useState<LlmUsageWindow>('7d');
  const [usage, setUsage] = useState<LlmUsageResponse | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);

  useEffect(() => {
    let mounted = true;
    listLlmConfig()
      .then((payload) => {
        if (mounted) setTasks(payload.tasks);
      })
      .catch(() => pushError('Could not load LLM config.'))
      .finally(() => {
        if (mounted) setIsLoadingConfig(false);
      });
    return () => {
      mounted = false;
    };
  }, [pushError]);

  const loadUsage = useCallback(
    async (window: LlmUsageWindow) => {
      setUsageWindow(window);
      setIsLoadingUsage(true);
      try {
        setUsage(await getLlmUsage(window));
      } catch {
        pushError('Could not load usage.');
      } finally {
        setIsLoadingUsage(false);
      }
    },
    [pushError],
  );

  useEffect(() => {
    void loadUsage('7d');
  }, [loadUsage]);

  const saveConfig = useCallback(
    async (task: string, input: LlmConfigUpdateInput): Promise<boolean> => {
      setSavingTask(task);
      try {
        const updated = await updateLlmConfig(task, input);
        setTasks((current) => current.map((row) => (row.task === task ? updated : row)));
        return true;
      } catch {
        pushError('Could not save LLM config.');
        return false;
      } finally {
        setSavingTask(null);
      }
    },
    [pushError],
  );

  const runTest = useCallback(
    async (input: LlmTestInput) => {
      if (!input.prompt.trim()) {
        pushError('Enter a prompt to test.');
        return;
      }
      setIsTesting(true);
      setTestResult(null);
      try {
        setTestResult(await testLlmCall(input));
      } catch {
        pushError('Test request failed.');
      } finally {
        setIsTesting(false);
      }
    },
    [pushError],
  );

  return {
    isLoadingConfig,
    isLoadingUsage,
    isTesting,
    loadUsage,
    runTest,
    saveConfig,
    savingTask,
    tasks,
    testResult,
    usage,
    usageWindow,
  };
}
