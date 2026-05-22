import { createContext, createElement, PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

type ErrorItem = {
  id: string;
  message: string;
};

type ErrorBannerContextValue = {
  dismissError: (id: string) => void;
  errors: ErrorItem[];
  pushError: (message: string) => void;
};

const ErrorBannerContext = createContext<ErrorBannerContextValue | null>(null);

export function ErrorBannerProvider({ children }: PropsWithChildren) {
  const [errors, setErrors] = useState<ErrorItem[]>([]);

  const dismissError = useCallback((id: string) => {
    setErrors((current) => current.filter((error) => error.id !== id));
  }, []);

  const pushError = useCallback((message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setErrors((current) => [...current, { id, message }]);
    globalThis.setTimeout(() => dismissError(id), 4000);
  }, [dismissError]);

  const value = useMemo(() => ({ dismissError, errors, pushError }), [dismissError, errors, pushError]);

  return createElement(ErrorBannerContext.Provider, { value }, children);
}

export function useErrorBanner(): ErrorBannerContextValue {
  const value = useContext(ErrorBannerContext);
  if (!value) {
    throw new Error('useErrorBanner must be used within ErrorBannerProvider');
  }
  return value;
}
