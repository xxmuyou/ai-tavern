import { useCallback, useEffect, useState } from 'react';

import { listAdminSettings, updateAdminSetting } from '@/api/companion-client';
import type { AdminSettingItem } from '@/api/types';

export function useAdminSettings() {
  const [settings, setSettings] = useState<AdminSettingItem[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listAdminSettings();
      setSettings(data.settings);
      setGroups(data.groups);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (key: string, value: string, confirm?: string) => {
      await updateAdminSetting(key, value, confirm);
      await reload();
    },
    [reload],
  );

  return { settings, groups, isLoading, error, reload, save } as const;
}
