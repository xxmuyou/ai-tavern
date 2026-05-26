import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { deletePushToken } from '@/api/companion-client';
import { usePush } from '@/hooks/use-push';
import { useSession } from '@/hooks/use-session';

export function PushRegistrar() {
  const { session } = useSession();
  const push = usePush();
  const { register, token } = push;
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (session && Platform.OS !== 'web') {
      void register();
    }
    if (!session && tokenRef.current) {
      void deletePushToken(tokenRef.current);
      tokenRef.current = null;
    }
  }, [register, session]);

  return null;
}
