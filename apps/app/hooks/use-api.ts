import { useCallback, useEffect, useState } from 'react';

import { clearStoredAuthSession, requestJson } from '@/api/companion-client';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export class QuotaExceededError extends ApiError {}
export class RateLimitedError extends ApiError {
  constructor(message: string, readonly retryAfter: number | null) {
    super(message, 429, 'rate_limited');
  }
}
export class ServerError extends ApiError {}
export class NetworkError extends ApiError {}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await requestJson<T>(path, init);
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    const message = error instanceof Error ? error.message : 'Request failed';

    if (status === 401) {
      clearStoredAuthSession();
      throw new ApiError('Your session has expired. Please sign in again.', 401, 'unauthorized');
    }
    if (status === 402) {
      throw new QuotaExceededError('You have reached your daily limit.', 402, 'quota_exceeded');
    }
    if (status === 429) {
      throw new RateLimitedError('Too many requests. Please try again later.', null);
    }
    if (status && status >= 500) {
      throw new ServerError('The server is temporarily unavailable. Please try again later.', status, 'server_error');
    }
    if (!status) {
      throw new NetworkError('Network connection failed.', undefined, 'network_error');
    }
    throw new ApiError(message, status);
  }
}

export function useApi<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextData = await loader();
      setData(nextData);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error('Request failed'));
    } finally {
      setIsLoading(false);
    }
  }, deps);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, error, isLoading, refetch };
}
