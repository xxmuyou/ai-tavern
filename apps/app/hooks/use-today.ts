import { getToday } from '@/api/companion-client';
import type { TodayResponse } from '@/api/types';

import { useApi } from './use-api';

export function useToday() {
  return useApi<TodayResponse>(() => getToday(), []);
}
