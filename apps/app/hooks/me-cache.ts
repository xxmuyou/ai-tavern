import { fetchMe } from '@/api/companion-client';
import type { MeResponse } from '@/api/types';

let cachedToken: string | null = null;
let cachedPromise: Promise<MeResponse> | null = null;

export function getMe(token: string): Promise<MeResponse> {
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
