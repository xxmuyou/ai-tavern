import type { DimensionValues } from "../relationships/level";
import type { UnlockEvent } from "../relationships/unlocks";
import { parseUnlockCondition } from "./unlock";

type SceneUnlockRow = {
  id: string;
  name: string;
  unlock_condition: string | null;
};

export async function detectNewSceneUnlocks(
  env: Env,
  args: {
    companionId: string;
    previous: DimensionValues;
    next: DimensionValues;
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
