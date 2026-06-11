import { useEffect, useState } from 'react';

import type { MeResponse } from '@/api/types';
import { getMe } from '@/hooks/me-cache';
import { useSession } from '@/hooks/use-session';

export function useMe(): { me: MeResponse | null; isLoading: boolean; error: unknown } {
  const { session } = useSession();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(session));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!session) {
      setMe(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    let mounted = true;
    setIsLoading(true);
    setError(null);
    getMe(session.token)
      .then((payload) => {
        if (mounted) {
          setMe(payload);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err);
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [session]);

  return { me, isLoading, error };
}
