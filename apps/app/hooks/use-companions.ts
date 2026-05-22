import { getCompanion, getRelationship, listCompanions } from '@/api/companion-client';
import type { CompanionDetailResponse, CompanionsListResponse, CompanionSource, RelationshipResponse } from '@/api/types';

import { useApi } from './use-api';

export type CompanionSourceFilter = CompanionSource | 'all';

export function useCompanions(source: CompanionSourceFilter) {
  return useApi<CompanionsListResponse>(() => listCompanions(source), [source]);
}

export function useCompanion(companionId: string) {
  return useApi<CompanionDetailResponse>(() => getCompanion(companionId), [companionId]);
}

export function useRelationship(companionId: string) {
  return useApi<RelationshipResponse>(() => getRelationship(companionId), [companionId]);
}
