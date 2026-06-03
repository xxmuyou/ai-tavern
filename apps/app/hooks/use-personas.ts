import { listPersonas } from '@/api/companion-client';
import type { PersonasResponse } from '@/api/types';

import { useApi } from './use-api';

export function usePersonas() {
  return useApi<PersonasResponse>(() => listPersonas(), []);
}
