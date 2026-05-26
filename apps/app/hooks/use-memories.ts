import { getMemories } from '@/api/companion-client';
import type { MemoriesResponse } from '@/api/types';

import { useApi } from './use-api';

export function useMemories(companionId?: string) {
  return useApi<MemoriesResponse>(() => getMemories(companionId), [companionId]);
}
