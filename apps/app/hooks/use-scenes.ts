import { enterScene, getScenes } from '@/api/companion-client';
import type { SceneEnterResponse, ScenesListResponse } from '@/api/types';

import { useApi } from './use-api';

export function useScenes(opts: { enabled?: boolean } = {}) {
  return useApi<ScenesListResponse>(getScenes, [], { enabled: opts.enabled ?? true });
}

export function useSceneEntry(sceneId: string) {
  return useApi<SceneEnterResponse>(() => enterScene(sceneId), [sceneId]);
}
