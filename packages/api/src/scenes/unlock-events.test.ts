import { describe, expect, it } from "vitest";

import { ZERO_DIMENSIONS, type DimensionValues } from "../relationships/level";
import { detectNewSceneUnlocks } from "./unlock-events";

function dims(partial: Partial<DimensionValues>): DimensionValues {
  return { ...ZERO_DIMENSIONS, ...partial };
}

function createEnv() {
  const userSceneUnlocks = new Set<string>();
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first<T>() {
                if (sql.includes("FROM user_scene_unlocks")) {
                  const [userId, sceneId] = values as [string, string];
                  return (userSceneUnlocks.has(`${userId}:${sceneId}`) ? { one: 1 } : null) as T | null;
                }
                return null;
              },
              async run() {
                if (sql.includes("INSERT OR IGNORE INTO user_scene_unlocks")) {
                  const [userId, sceneId] = values as [string, string];
                  const key = `${userId}:${sceneId}`;
                  if (userSceneUnlocks.has(key)) {
                    return { meta: { changes: 0 } };
                  }
                  userSceneUnlocks.add(key);
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              },
            };
          },
          async all<T>() {
            return {
              results: [
                {
                  id: "restaurant",
                  name: "Restaurant",
                  unlock_condition: JSON.stringify({
                    companion_id: "maya",
                    dim: "closeness",
                    type: "min_relationship",
                    value: 10,
                  }),
                },
              ] as T[],
            };
          },
        };
      },
    },
  } as unknown as Env;
}

describe("detectNewSceneUnlocks", () => {
  it("uses the current companion dimensions instead of requiring the condition companion id", async () => {
    const events = await detectNewSceneUnlocks(createEnv(), {
      companionId: "echo",
      next: dims({ closeness: 12 }),
      previous: dims({ closeness: 9 }),
      userId: "u1",
    });

    expect(events).toEqual([
      expect.objectContaining({
        key: "scene:restaurant",
        kind: "scene",
        scene_id: "restaurant",
      }),
    ]);
  });

  it("does not emit the same scene unlock twice once recorded", async () => {
    const env = createEnv();
    const args = {
      companionId: "echo",
      next: dims({ closeness: 12 }),
      previous: dims({ closeness: 9 }),
      userId: "u1",
    };

    expect(await detectNewSceneUnlocks(env, args)).toHaveLength(1);
    expect(await detectNewSceneUnlocks(env, args)).toEqual([]);
  });
});
