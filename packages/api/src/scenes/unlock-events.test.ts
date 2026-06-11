import { describe, expect, it } from "vitest";

import { ZERO_DIMENSIONS, type DimensionValues } from "../relationships/level";
import { detectNewSceneUnlocks } from "./unlock-events";

function dims(partial: Partial<DimensionValues>): DimensionValues {
  return { ...ZERO_DIMENSIONS, ...partial };
}

function createEnv() {
  return {
    DB: {
      prepare() {
        return {
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
    });

    expect(events).toEqual([
      expect.objectContaining({
        key: "scene:restaurant",
        kind: "scene",
        scene_id: "restaurant",
      }),
    ]);
  });
});
