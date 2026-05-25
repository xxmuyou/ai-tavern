import { useEffect, useState } from 'react';

import { fetchMe } from '@/api/companion-client';
import type { MeResponse } from '@/api/types';
import { useSession } from '@/hooks/use-session';

let cachedToken: string | null = null;
let cachedPromise: Promise<MeResponse> | null = null;

function getMe(token: string): Promise<MeResponse> {
  if (cachedPromise && cachedToken === token) {
    return cachedPromise;
  }
  cachedToken = token;
  cachedPromise = fetchMe().catch((err) => {
    if (cachedToken === token) {
      cachedPromise = null;
      cachedToken = null;
    }
    throw err;
  });
  return cachedPromise;
}

export function invalidateMeCache(): void {
  cachedPromise = null;
  cachedToken = null;
}

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
