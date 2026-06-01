import { useCallback, useEffect, useState } from 'react';

import { listAdminSettings, revealAdminSettingSecret, updateAdminSetting } from '@/api/companion-client';
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
      setError(null);
      try {
        const result = await updateAdminSetting(key, value, confirm);
        setSettings((current) =>
          current.map((item) => (item.key === key ? result.setting : item)),
        );
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to save setting.');
        throw nextError;
      }
    },
    [],
  );

  const reveal = useCallback(
    async (key: string) => {
      setError(null);
      try {
        return await revealAdminSettingSecret(key);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to reveal secret.');
        throw nextError;
      }
    },
    [],
  );

  return { settings, groups, isLoading, error, reload, reveal, save } as const;
}
