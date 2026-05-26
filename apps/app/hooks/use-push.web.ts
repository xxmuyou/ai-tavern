import { useCallback, useEffect, useState } from 'react';

export function usePush(initialEnabled?: boolean | null) {
  const [enabled, setEnabled] = useState(initialEnabled ?? false);

  useEffect(() => {
    if (typeof initialEnabled === 'boolean') {
      setEnabled(initialEnabled);
    }
  }, [initialEnabled]);

  const register = useCallback(async () => {
    setEnabled(false);
  }, []);

  const setPushEnabled = useCallback(async (next: boolean) => {
    setEnabled(next);
  }, []);

  return {
    enabled,
    error: null as string | null,
    isLoading: false,
    permissionStatus: null as string | null,
    register,
    setPushEnabled,
    token: null as string | null,
  };
}
