import { useCallback, useState } from 'react';

const STORAGE_KEY = 'xtbit.chat.autoVoice';

function readInitial(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

export type UseAutoVoiceResult = {
  enabled: boolean;
  toggle: () => void;
};

/**
 * Global "auto-play voice" preference for chat. When on, each new companion
 * reply is spoken automatically; when off (the default), nothing is synthesized.
 * Persisted in localStorage on web (shared across companions); on native it is
 * in-memory only since the repo has no AsyncStorage. Off by default.
 */
export function useAutoVoice(): UseAutoVoiceResult {
  const [enabled, setEnabled] = useState<boolean>(readInitial);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      }
      return next;
    });
  }, []);

  return { enabled, toggle };
}
