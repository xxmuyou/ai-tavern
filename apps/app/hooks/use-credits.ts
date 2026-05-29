import { getCreditBalance } from '@/api/companion-client';
import type { CreditBalanceResponse } from '@/api/types';

import { useApi } from './use-api';

export function useCredits() {
  return useApi<CreditBalanceResponse>(getCreditBalance, []);
}
