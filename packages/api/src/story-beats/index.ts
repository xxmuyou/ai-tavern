import type { RelationshipStage } from "../life/types";
import { ZERO_DIMENSIONS } from "../relationships/level";
import { loadRelationship } from "../relationships/engine";
import { deriveStage } from "../relationships/stage";
import { STAGE_RANK } from "../relationships/unlocks";

export type StoryBeatStatus = "active" | "waiting_stage" | "completed";

export type StoryBeatPublic = {
  id: string;
  title: string;
  beat_order: number;
  stage_gate: RelationshipStage;
  scene_id: string | null;
  opener: string;
  objective: string;
  reward_unlock_key: string | null;
  status: StoryBeatStatus;
};

type StoryBeatRow = {
  id: string;
  companion_id: string;
  beat_order: number;
  title: string;
  stage_gate: string;
  scene_id: string | null;
  opener: string;
  objective: string;
  reward_unlock_key: string | null;
};

type StoryProgressRow = {
  completed_beat_ids: string | null;
};

export async function loadStoryBeatForScene(
  env: Env,
  userId: string,
  companionId: string,
  sceneId: string | null,
): Promise<StoryBeatPublic | null> {
  const [beats, completed, stage] = await Promise.all([
    loadBeats(env, companionId),
    loadCompletedBeatIds(env, userId, companionId),
    loadCurrentStage(env, userId, companionId),
  ]);

  if (beats.length === 0) {
    return null;
  }

  const nextBeat = beats.find((beat) => !completed.has(beat.id));
  if (!nextBeat) {
    return null;
  }

  if (nextBeat.scene_id && nextBeat.scene_id !== sceneId) {
    return null;
  }

  if (!stageMeets(stage, nextBeat.stage_gate)) {
    return toPublicBeat(nextBeat, "waiting_stage");
  }

  return toPublicBeat(nextBeat, "active");
}

export async function completeCurrentStoryBeat(
  env: Env,
  userId: string,
  companionId: string,
  sceneId: string | null,
  now: number,
): Promise<StoryBeatPublic | null> {
  const beat = await loadStoryBeatForScene(env, userId, companionId, sceneId);
  if (!beat || beat.status !== "active") {
    return null;
  }

  const completed = await loadCompletedBeatIds(env, userId, companionId);
  if (completed.has(beat.id)) {
    return null;
  }
  completed.add(beat.id);

  await env.DB.prepare(
    `INSERT INTO user_story_progress
       (user_id, companion_id, current_beat_id, completed_beat_ids, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, companion_id) DO UPDATE SET
       current_beat_id = excluded.current_beat_id,
       completed_beat_ids = excluded.completed_beat_ids,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, companionId, beat.id, JSON.stringify([...completed]), now)
    .run();

  if (beat.reward_unlock_key) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO relationship_unlocks (user_id, companion_id, unlock_key, unlocked_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(userId, companionId, beat.reward_unlock_key, now)
      .run();
  }

  return { ...beat, status: "completed" };
}

async function loadBeats(env: Env, companionId: string): Promise<StoryBeatRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, companion_id, beat_order, title, stage_gate, scene_id, opener, objective, reward_unlock_key
     FROM companion_story_beats
     WHERE companion_id = ? AND is_active = 1
     ORDER BY beat_order ASC, id ASC`,
  )
    .bind(companionId)
    .all<StoryBeatRow>();
  return results ?? [];
}

async function loadCompletedBeatIds(env: Env, userId: string, companionId: string): Promise<Set<string>> {
  const row = await env.DB.prepare(
    `SELECT completed_beat_ids
     FROM user_story_progress
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<StoryProgressRow>();
  return parseCompletedBeatIds(row?.completed_beat_ids);
}

async function loadCurrentStage(env: Env, userId: string, companionId: string): Promise<RelationshipStage> {
  const relationship = await loadRelationship(env, userId, companionId);
  return deriveStage(relationship?.dimensions ?? { ...ZERO_DIMENSIONS }).stage;
}

function parseCompletedBeatIds(raw: string | null | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function stageMeets(current: RelationshipStage, required: string): required is RelationshipStage {
  const currentRank = STAGE_RANK[current];
  const requiredRank = STAGE_RANK[required];
  return currentRank !== undefined && requiredRank !== undefined && currentRank >= requiredRank;
}

function toPublicBeat(row: StoryBeatRow, status: StoryBeatStatus): StoryBeatPublic {
  return {
    beat_order: row.beat_order,
    id: row.id,
    objective: row.objective,
    opener: row.opener,
    reward_unlock_key: row.reward_unlock_key,
    scene_id: row.scene_id,
    stage_gate: row.stage_gate as RelationshipStage,
    status,
    title: row.title,
  };
}
