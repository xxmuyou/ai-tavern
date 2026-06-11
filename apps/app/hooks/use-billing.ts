import { getBillingStatus } from '@/api/companion-client';
import type { BillingStatusResponse } from '@/api/types';

import { useApi } from './use-api';

export function useBilling(opts: { enabled?: boolean } = {}) {
  return useApi<BillingStatusResponse>(getBillingStatus, [], { enabled: opts.enabled ?? true });
}
