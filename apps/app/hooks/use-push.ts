import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import {
  deletePushToken,
  registerPushToken,
  updatePushPreference,
} from '@/api/companion-client';

export function usePush(initialEnabled?: boolean | null) {
  const [enabled, setEnabled] = useState(initialEnabled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof initialEnabled === 'boolean') {
      setEnabled(initialEnabled);
    }
  }, [initialEnabled]);

  const register = useCallback(async () => {
    if (Platform.OS === 'web') {
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const notifications = await loadNotifications();
      const current = await notifications.getPermissionsAsync();
      const permission = isPermissionGranted(current) ? current : await notifications.requestPermissionsAsync();
      const status = isPermissionGranted(permission) ? 'granted' : 'denied';
      setPermissionStatus(status);
      if (!isPermissionGranted(permission)) {
        setEnabled(false);
        return;
      }

      const pushToken = await notifications.getExpoPushTokenAsync();
      setToken(pushToken.data);
      const payload = await registerPushToken(pushToken.data, Platform.OS);
      setEnabled(payload.enabled);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Push registration failed.');
      setEnabled(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setPushEnabled = useCallback(
    async (next: boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        if (!next && token) {
          const payload = await deletePushToken(token);
          setEnabled(payload.enabled);
          return;
        }
        if (next && Platform.OS !== 'web') {
          await register();
          return;
        }
        const payload = await updatePushPreference(next);
        setEnabled(payload.enabled);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Push preference could not be updated.');
      } finally {
        setIsLoading(false);
      }
    },
    [register, token],
  );

  return { enabled, error, isLoading, permissionStatus, register, setPushEnabled, token };
}

async function loadNotifications() {
  return Notifications;
}

function isPermissionGranted(permission: unknown): boolean {
  const value = permission as { granted?: unknown; status?: unknown };
  return value.granted === true || value.status === 'granted';
}
