import { describe, expect, it } from "vitest";

import {
  buildStoryMoment,
  completeCurrentStoryBeat,
  loadStoryBeatForScene,
  markStoryBeatComplete,
  reopenStoryBeat,
} from ".";

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
  arc_id?: string | null;
  completion_mode?: string | null;
  created_by_user_id?: string | null;
  is_user_editable?: number | null;
  source_type?: string | null;
};

type RelationshipFixture = {
  user_id: string;
  companion_id: string;
  closeness?: number;
  trust?: number;
  romance?: number;
  friendship?: number;
};

type SceneFixture = {
  id: string;
  name: string;
  mood: string;
  tags?: string | null;
  art_url?: string | null;
  unlock_condition?: string | null;
  display_order?: number;
  is_active?: number;
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

  it("does not auto-complete a manual beat after chat", async () => {
    const env = createEnv({
      beats: [
        beat({
          completion_mode: "manual",
          id: "b1",
          scene_id: "cafe",
          stage_gate: "first_contact",
        }),
      ],
      relationships: [{ companion_id: "maya", user_id: "u1" }],
    });

    const completed = await completeCurrentStoryBeat(env, "u1", "maya", "cafe", 1000);
    const current = await loadStoryBeatForScene(env, "u1", "maya", "cafe");

    expect(completed).toBeNull();
    expect(current).toMatchObject({ id: "b1", status: "active" });
  });

  it("explicitly completes and reopens a manual beat", async () => {
    const env = createEnv({
      beats: [
        beat({
          completion_mode: "manual",
          id: "b1",
          scene_id: "cafe",
          stage_gate: "first_contact",
        }),
      ],
      relationships: [{ companion_id: "maya", user_id: "u1" }],
    });

    const completed = await markStoryBeatComplete(env, "u1", "maya", "b1", 1000);
    const reopened = await reopenStoryBeat(env, "u1", "maya", "b1", 2000);

    expect(completed).toMatchObject({ id: "b1", status: "completed" });
    expect(reopened).toMatchObject({ id: "b1", status: "active" });
  });

  it("builds a story moment with a checked scene transition when a target scene exists", async () => {
    const env = createEnv({
      beats: [
        beat({
          id: "b1",
          objective: "Walk Maya home without making it too heavy.",
          opener: "Maya lingers near the cafe door.",
          scene_id: "cafe",
        }),
      ],
      relationships: [{ companion_id: "maya", user_id: "u1" }],
      scenes: [
        scene({ id: "cafe", name: "Cafe", tags: '["cafe"]' }),
        scene({ id: "night_street", name: "Night Street", tags: '["street"]' }),
      ],
    });

    const moment = await buildStoryMoment(env, "u1", "maya", "cafe");
    const travel = moment?.choices.find((choice) => choice.id === "b1:go");

    expect(moment).toMatchObject({
      beat_id: "b1",
      title: "Beat",
    });
    expect(travel).toMatchObject({
      target_scene_id: "night_street",
      transition_mode: "scene",
    });
  });

  it("downgrades travel choices to offstage when no preset scene matches", async () => {
    const env = createEnv({
      beats: [
        beat({
          id: "b1",
          objective: "Walk Maya home without making it too heavy.",
          opener: "Maya lingers near the cafe door.",
          scene_id: "cafe",
        }),
      ],
      relationships: [{ companion_id: "maya", user_id: "u1" }],
      scenes: [scene({ id: "cafe", name: "Cafe", tags: '["cafe"]' })],
    });

    const moment = await buildStoryMoment(env, "u1", "maya", "cafe");
    const travel = moment?.choices.find((choice) => choice.id === "b1:go");

    expect(travel).toMatchObject({
      target_scene_id: null,
      transition_mode: "offstage",
    });
  });
});

function beat(partial: Partial<BeatFixture>): BeatFixture {
  return {
    beat_order: 1,
    arc_id: null,
    companion_id: "maya",
    completion_mode: "auto",
    created_by_user_id: null,
    id: "b1",
    is_active: 1,
    is_user_editable: 0,
    objective: "objective",
    opener: "hook",
    reward_unlock_key: null,
    scene_id: "cafe",
    source_type: "official_seed",
    stage_gate: "first_contact",
    title: "Beat",
    ...partial,
  };
}

function scene(partial: Partial<SceneFixture>): SceneFixture {
  return {
    art_url: null,
    display_order: 1,
    id: "cafe",
    is_active: 1,
    mood: "Calm",
    name: "Cafe",
    tags: null,
    unlock_condition: null,
    ...partial,
  };
}

function createEnv(input: {
  beats: BeatFixture[];
  relationships: RelationshipFixture[];
  scenes?: SceneFixture[];
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
            if (sql.includes("FROM scenes")) {
              return {
                results: (input.scenes ?? [])
                  .filter((item) => (item.is_active ?? 1) === 1)
                  .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.id.localeCompare(b.id)) as T[],
              };
            }
            return { results: [] as T[] };
          },
          async first<T>() {
            if (sql.includes("FROM scenes") && sql.includes("WHERE id = ?")) {
              return ((input.scenes ?? []).find(
                (item) => item.id === values[0] && (item.is_active ?? 1) === 1,
              ) ?? null) as T | null;
            }
            if (sql.includes("FROM companion_story_beats")) {
              const [beatId, companionId] = values;
              return (input.beats.find(
                (item) =>
                  item.id === beatId &&
                  item.companion_id === companionId &&
                  (item.is_active ?? 1) === 1,
              ) ?? null) as T | null;
            }
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
