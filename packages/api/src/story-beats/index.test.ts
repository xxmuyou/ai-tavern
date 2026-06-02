import { describe, expect, it } from "vitest";

import { completeCurrentStoryBeat, loadStoryBeatForScene } from ".";

type BeatFixture = {
  id: string;
  companion_id: string;
  beat_order: number;
  title: string;
  stage_gate: string;
  scene_id: string | null;
  opener: string;
  objective: string;
  reward_unlock_key: string | null;
  is_active?: number;
};

type RelationshipFixture = {
  user_id: string;
  companion_id: string;
  closeness?: number;
  trust?: number;
  romance?: number;
  friendship?: number;
};

describe("story beats", () => {
  it("returns null when a companion has no beats", async () => {
    const env = createEnv({ beats: [], relationships: [] });
    await expect(loadStoryBeatForScene(env, "u1", "maya", "cafe")).resolves.toBeNull();
  });

  it("returns active beat when the stage gate and scene match", async () => {
    const env = createEnv({
      beats: [
        beat({
          id: "b1",
          scene_id: "cafe",
          stage_gate: "first_contact",
        }),
      ],
      relationships: [{ companion_id: "maya", user_id: "u1" }],
    });

    const result = await loadStoryBeatForScene(env, "u1", "maya", "cafe");

    expect(result).toMatchObject({
      id: "b1",
      opener: "hook",
      status: "active",
      title: "Beat",
    });
  });

  it("returns waiting_stage when the next beat is not reachable yet", async () => {
    const env = createEnv({
      beats: [beat({ id: "b1", scene_id: "cafe", stage_gate: "trusted" })],
      relationships: [{ closeness: 20, companion_id: "maya", user_id: "u1" }],
    });

    const result = await loadStoryBeatForScene(env, "u1", "maya", "cafe");

    expect(result).toMatchObject({
      id: "b1",
      stage_gate: "trusted",
      status: "waiting_stage",
    });
  });

  it("completes the active beat and returns the next one afterward", async () => {
    const env = createEnv({
      beats: [
        beat({ beat_order: 1, id: "b1", scene_id: "cafe", stage_gate: "first_contact" }),
        beat({ beat_order: 2, id: "b2", scene_id: "cafe", stage_gate: "first_contact" }),
      ],
      relationships: [{ companion_id: "maya", user_id: "u1" }],
    });

    const completed = await completeCurrentStoryBeat(env, "u1", "maya", "cafe", 1000);
    const next = await loadStoryBeatForScene(env, "u1", "maya", "cafe");

    expect(completed).toMatchObject({ id: "b1", status: "completed" });
    expect(next).toMatchObject({ id: "b2", status: "active" });
  });
});

function beat(partial: Partial<BeatFixture>): BeatFixture {
  return {
    beat_order: 1,
    companion_id: "maya",
    id: "b1",
    is_active: 1,
    objective: "objective",
    opener: "hook",
    reward_unlock_key: null,
    scene_id: "cafe",
    stage_gate: "first_contact",
    title: "Beat",
    ...partial,
  };
}

function createEnv(input: {
  beats: BeatFixture[];
  relationships: RelationshipFixture[];
}): Env {
  const completed = new Set<string>();

  return {
    DB: {
      prepare(sql: string) {
        const exec = (values: unknown[]) => ({
          async all<T>() {
            if (sql.includes("FROM companion_story_beats")) {
              const companionId = values[0] as string;
              return {
                results: input.beats
                  .filter((item) => item.companion_id === companionId && (item.is_active ?? 1) === 1)
                  .sort((a, b) => a.beat_order - b.beat_order || a.id.localeCompare(b.id)) as T[],
              };
            }
            return { results: [] as T[] };
          },
          async first<T>() {
            if (sql.includes("FROM relationships")) {
              const [userId, companionId] = values;
              const rel = input.relationships.find(
                (item) => item.user_id === userId && item.companion_id === companionId,
              );
              return rel
                ? ({
                    closeness: rel.closeness ?? 0,
                    distance: 0,
                    first_met_at: 0,
                    friendship: rel.friendship ?? 0,
                    hostility: 0,
                    last_interaction_at: 0,
                    level_label: "Stranger",
                    romance: rel.romance ?? 0,
                    tension: 0,
                    trust: rel.trust ?? 0,
                  } as T)
                : null;
            }
            if (sql.includes("FROM user_story_progress")) {
              return { completed_beat_ids: JSON.stringify([...completed]) } as T;
            }
            return null;
          },
          async run() {
            if (sql.includes("INSERT INTO user_story_progress")) {
              const raw = values[3] as string;
              const parsed = JSON.parse(raw) as string[];
              completed.clear();
              for (const id of parsed) completed.add(id);
            }
            return { meta: { changes: 1 } };
          },
        });
        return {
          ...exec([]),
          bind(...values: unknown[]) {
            return exec(values);
          },
        };
      },
    },
  } as unknown as Env;
}
