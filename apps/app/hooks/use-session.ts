import { createContext, createElement, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  applySessionFragment,
  clearStoredAuthSession,
  logout,
  readStoredAuthSession,
  sendMagicLink as sendMagicLinkRequest,
  startGoogleLogin,
  writeStoredAuthSession,
  type AuthSession,
  type MagicLinkResponse,
} from '@/api/companion-client';
import { invalidateMeCache } from '@/hooks/use-me';

type SessionContextValue = {
  acceptSessionFragment: (hash: string) => AuthSession | null;
  error: string | null;
  isLoading: boolean;
  sendMagicLink: (email: string) => Promise<MagicLinkResponse>;
  session: AuthSession | null;
  signInGoogle: () => void;
  signOut: () => Promise<void>;
  storeSession: (session: AuthSession) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function isSessionValid(session: AuthSession | null): session is AuthSession {
  if (!session) {
    return false;
  }
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredAuthSession();
    if (isSessionValid(stored)) {
      setSession(stored);
    } else {
      clearStoredAuthSession();
    }
    setIsLoading(false);
  }, []);

  const storeSession = useCallback((nextSession: AuthSession) => {
    writeStoredAuthSession(nextSession);
    setSession(nextSession);
  }, []);

  const acceptSessionFragment = useCallback((hash: string) => {
    const nextSession = applySessionFragment(hash);
    if (nextSession) {
      setSession(nextSession);
    }
    return nextSession;
  }, []);

  const signInGoogle = useCallback(() => {
    startGoogleLogin('/auth/success');
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    setError(null);
    const response = await sendMagicLinkRequest(email, '/auth/success');
    if (response.token && response.expiresAt && response.email) {
      storeSession({
        email: response.email,
        expiresAt: response.expiresAt,
        token: response.token,
        user: response.user ?? { email: response.email, id: '' },
      });
      invalidateMeCache();
    }
    return response;
  }, [storeSession]);

  const signOut = useCallback(async () => {
    setError(null);
    await logout();
    invalidateMeCache();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      acceptSessionFragment,
      error,
      isLoading,
      sendMagicLink,
      session,
      signInGoogle,
      signOut,
      storeSession,
    }),
    [acceptSessionFragment, error, isLoading, sendMagicLink, session, signInGoogle, signOut, storeSession],
  );

  return createElement(SessionContext.Provider, { value }, children);
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return value;
}
