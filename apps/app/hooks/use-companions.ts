import { getCompanion, getCompanionUnlocks, getRelationship, listCompanions } from '@/api/companion-client';
import type {
  CompanionDetailResponse,
  CompanionsListResponse,
  CompanionSource,
  RelationshipResponse,
  RelationshipUnlocksResponse,
} from '@/api/types';

import { useApi } from './use-api';

export type CompanionSourceFilter = CompanionSource | 'all' | 'public' | 'favorites';
export type CompanionSort = 'recent' | 'popular';

export function useCompanions(
  source: CompanionSourceFilter,
  opts: { q?: string; sort?: CompanionSort } = {},
) {
  return useApi<CompanionsListResponse>(
    () => listCompanions(source, { q: opts.q, sort: opts.sort }),
    [source, opts.q, opts.sort],
  );
}

export function useCompanion(companionId: string) {
  return useApi<CompanionDetailResponse>(() => getCompanion(companionId), [companionId]);
}

export function useRelationship(companionId: string) {
  return useApi<RelationshipResponse>(() => getRelationship(companionId), [companionId]);
}

export function useCompanionUnlocks(companionId: string) {
  return useApi<RelationshipUnlocksResponse>(() => getCompanionUnlocks(companionId), [companionId]);
}
