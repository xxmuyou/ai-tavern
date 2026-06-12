import type { DimensionValues } from "../relationships/level";
import type { UnlockEvent } from "../relationships/unlocks";
import { parseUnlockCondition, recordUserSceneUnlock } from "./unlock";

type SceneUnlockRow = {
  id: string;
  name: string;
  unlock_condition: string | null;
};

export async function detectNewSceneUnlocks(
  env: Env,
  args: {
    companionId: string;
    now?: number;
    previous: DimensionValues;
    next: DimensionValues;
    userId: string;
  },
): Promise<UnlockEvent[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, unlock_condition
     FROM scenes
     WHERE is_active = 1 AND unlock_condition IS NOT NULL
     ORDER BY display_order ASC, id ASC`,
  ).all<SceneUnlockRow>();

  const out: UnlockEvent[] = [];
  for (const row of results ?? []) {
    const condition = parseUnlockCondition(row.unlock_condition);
    if (!condition) continue;
    if (args.previous[condition.dim] >= condition.value) continue;
    if (args.next[condition.dim] < condition.value) continue;
    const recorded = await recordUserSceneUnlock(env, {
      sceneId: row.id,
      sourceCompanionId: args.companionId,
      unlockedAt: args.now ?? Date.now(),
      userId: args.userId,
    });
    if (!recorded) continue;
    out.push({
      key: `scene:${row.id}`,
      kind: "scene",
      label: `New place unlocked: ${row.name}`,
      scene_id: row.id,
      scene_name: row.name,
    });
  }
  return out;
}
