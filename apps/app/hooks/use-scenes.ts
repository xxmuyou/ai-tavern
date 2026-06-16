import { enterScene, getScenes, getSceneStory, listSceneStories, listSceneStoryInviteCompanions } from '@/api/companion-client';
import type {
  SceneEnterResponse,
  SceneStoriesResponse,
  SceneStoryInviteCompanionsResponse,
  SceneStoryResponse,
  ScenesListResponse,
} from '@/api/types';

import { useApi } from './use-api';

export function useScenes(opts: { enabled?: boolean } = {}) {
  return useApi<ScenesListResponse>(getScenes, [], { enabled: opts.enabled ?? true });
}

export function useSceneEntry(sceneId: string) {
  return useApi<SceneEnterResponse>(() => enterScene(sceneId), [sceneId]);
}

export function useSceneStories(sceneId: string, companionId?: string | null) {
  return useApi<SceneStoriesResponse>(() => listSceneStories(sceneId, companionId), [sceneId, companionId ?? '']);
}

export function useSceneStory(sceneId: string, storyId: string | null, companionId?: string | null) {
  return useApi<SceneStoryResponse>(
    () => storyId ? getSceneStory(sceneId, storyId, companionId) : Promise.resolve({ story: null as never }),
    [sceneId, storyId ?? '', companionId ?? ''],
    { enabled: Boolean(sceneId && storyId) },
  );
}

export function useSceneStoryInviteCompanions(sceneId: string, opts: { enabled?: boolean } = {}) {
  return useApi<SceneStoryInviteCompanionsResponse>(
    () => listSceneStoryInviteCompanions(sceneId),
    [sceneId],
    { enabled: opts.enabled ?? true },
  );
}
