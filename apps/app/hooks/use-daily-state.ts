import { getDailyState } from '@/api/companion-client';
import type { DailyState } from '@/api/types';

import { useApi } from './use-api';

export function useDailyState(companionId: string, includeFlavor = false) {
  return useApi<DailyState>(
    () => getDailyState(companionId, includeFlavor),
    [companionId, includeFlavor],
  );
}
