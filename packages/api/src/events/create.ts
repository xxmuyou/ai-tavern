import { buildRelationshipNarrative } from "../chat/narrative";
import { loadRelationship } from "../relationships/engine";
import { ZERO_DIMENSIONS } from "../relationships/level";
import { generateEventPayload } from "./generator";
import { createPendingEvent } from "./repository";
import { loadCompanionForEvent, loadSceneForEvent } from "./support";
import type { EventResponseItem, SceneForPrompt, TriggerCandidate } from "./types";

export async function createSceneTriggeredEvent(
  env: Env,
  args: {
    userId: string;
    candidate: TriggerCandidate;
    scene: SceneForPrompt;
    now: number;
  },
): Promise<EventResponseItem | null> {
  const companion = await loadCompanionForEvent(env, args.candidate.companionId);
  if (!companion) return null;

  const relationship = await loadRelationship(env, args.userId, args.candidate.companionId);
  const narrative = buildRelationshipNarrative(
    {
      dimensions: relationship?.dimensions ?? { ...ZERO_DIMENSIONS },
      first_met_at: relationship?.first_met_at ?? null,
    },
    args.now,
  );

  const payload = await generateEventPayload(env, {
    companion,
    metadata: args.candidate.metadata,
    narrative,
    scene: args.scene,
    template: args.candidate.template,
    userId: args.userId,
  });

  return createPendingEvent(env, {
    companionId: args.candidate.companionId,
    eventType: args.candidate.template.event_type,
    metadata: args.candidate.metadata,
    now: args.now,
    payload,
    sceneId: args.candidate.sceneId,
    snapshot: args.candidate.snapshot,
    template: args.candidate.template,
    userId: args.userId,
  });
}

export async function createConflictEvent(
  env: Env,
  args: {
    userId: string;
    candidate: TriggerCandidate;
    narrative: string;
    now: number;
  },
): Promise<EventResponseItem | null> {
  const companion = await loadCompanionForEvent(env, args.candidate.companionId);
  if (!companion) return null;
  const scene = await loadSceneForEvent(env, args.candidate.sceneId);

  const payload = await generateEventPayload(env, {
    companion,
    metadata: args.candidate.metadata,
    narrative: args.narrative,
    scene,
    template: args.candidate.template,
    userId: args.userId,
  });

  return createPendingEvent(env, {
    companionId: args.candidate.companionId,
    eventType: args.candidate.template.event_type,
    metadata: args.candidate.metadata,
    now: args.now,
    payload,
    sceneId: args.candidate.sceneId,
    snapshot: args.candidate.snapshot,
    template: args.candidate.template,
    userId: args.userId,
  });
}
