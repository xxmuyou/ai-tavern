import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import {
  AUTH_EXPIRES_STORAGE_KEY,
  AUTH_TOKEN_STORAGE_KEY,
  BILLING_EMAIL_STORAGE_KEY,
  EMAIL_STORAGE_KEY,
  clearStoredAuthSession,
  createDevSession,
  writeStoredAuthSession,
} from '@/api/companion-client';

export function useAuthEmail() {
  const [email, setEmail] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    const storedEmail = readStoredEmail();
    setEmail(storedEmail);
    setDraftEmail(storedEmail);
    setToken(readStoredToken());
  }, []);

  const persistEmail = useCallback(async (value: string) => {
    const normalized = value.trim().toLowerCase();
    const session = await createDevSession(normalized);
    setEmail(normalized);
    setDraftEmail(normalized);
    setToken(session.token);
    writeStoredAuthSession(session);
  }, []);

  const signOut = useCallback(() => {
    setEmail('');
    setDraftEmail('');
    setToken('');
    clearStoredEmail();
  }, []);

  return {
    draftEmail,
    email,
    persistEmail,
    setDraftEmail,
    signOut,
    token,
  };
}

export function readStoredEmail(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? window.localStorage.getItem(BILLING_EMAIL_STORAGE_KEY) ?? '';
}

export function writeStoredEmail(value: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(EMAIL_STORAGE_KEY, value);
  window.localStorage.setItem(BILLING_EMAIL_STORAGE_KEY, value);
}

export function clearStoredEmail(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  clearStoredAuthSession();
}

function readStoredToken(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return '';
  }

  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '';
  const expiresAt = window.localStorage.getItem(AUTH_EXPIRES_STORAGE_KEY) ?? '';
  if (!token || (expiresAt && Date.parse(expiresAt) <= Date.now())) {
    clearStoredAuthSession();
    return '';
  }

  return token;
}
