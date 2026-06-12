import {
  getCompanion,
  getCompanionUnlocks,
  getRelationship,
  listCompanions,
  listPublicCompanions,
  listCompanionStoryArcs,
  listStoryArcTemplates,
} from '@/api/companion-client';
import type {
  CompanionDetailResponse,
  CompanionsListResponse,
  CompanionSource,
  RelationshipResponse,
  RelationshipUnlocksResponse,
  StoryArcsResponse,
  StoryArcTemplatesResponse,
} from '@/api/types';

import { useApi } from './use-api';

export type CompanionSourceFilter = CompanionSource | 'all' | 'public' | 'favorites';
export type CompanionSort = 'recent' | 'popular';
export type CompanionDiscoverySort = CompanionSort | 'favorites' | 'featured';
export type CompanionDiscoveryStyle = 'anime' | 'realistic';

export function useCompanions(
  source: CompanionSourceFilter,
  opts: { enabled?: boolean; q?: string; sort?: CompanionSort } = {},
) {
  return useApi<CompanionsListResponse>(
    () => listCompanions(source, { q: opts.q, sort: opts.sort }),
    [source, opts.q, opts.sort],
    { enabled: opts.enabled ?? true },
  );
}

export function usePublicCompanions(
  opts: {
    artStyle?: CompanionDiscoveryStyle;
    featured?: boolean;
    gender?: 'male' | 'female';
    q?: string;
    sort?: CompanionDiscoverySort;
    source?: 'official' | 'all';
  } = {},
) {
  return useApi<CompanionsListResponse>(
    () => listPublicCompanions(opts),
    [opts.artStyle, opts.featured, opts.gender, opts.q, opts.sort, opts.source],
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

export function useStoryArcTemplates() {
  return useApi<StoryArcTemplatesResponse>(listStoryArcTemplates, []);
}

export function useCompanionStoryArcs(companionId: string) {
  return useApi<StoryArcsResponse>(() => listCompanionStoryArcs(companionId), [companionId]);
}
