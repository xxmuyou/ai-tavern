import { enterScene, getScenes } from '@/api/companion-client';
import type { SceneEnterResponse, ScenesListResponse } from '@/api/types';

import { useApi } from './use-api';

export function useScenes() {
  return useApi<ScenesListResponse>(getScenes, []);
}

export function useSceneEntry(sceneId: string) {
  return useApi<SceneEnterResponse>(() => enterScene(sceneId), [sceneId]);
}
