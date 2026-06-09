import { describe, expect, it } from "vitest";

import {
  buildMomentPrompt,
  createMomentImageJob,
  loadMomentByMessage,
  processMomentImageJob,
  type MomentPromptContext,
  type StoryMomentImageRow,
} from "./moment-image";
import { loadBaseArtJob, type ImageGenJobRow } from "./base-art";
import { createOrReuseCutoutJob, processCutoutJob } from "./cutout";
import { ImageGenError } from "./types";

type Row = Record<string, unknown>;

function createEnv(): {
  env: Env;
  jobs: Map<string, Row>;
  moments: Map<string, Row>;
  companions: Map<string, Row>;
  cutouts: Map<string, Row>;
  assets: Map<string, Uint8Array>;
  queue: unknown[];
} {
  const jobs = new Map<string, Row>();
  const moments = new Map<string, Row>();
  const companions = new Map<string, Row>();
  const cutouts = new Map<string, Row>();
  const assets = new Map<string, Uint8Array>();
  const queue: unknown[] = [];

  function execute(sql: string, values: unknown[], mode: "run" | "first" | "all"): unknown {
    if (sql.includes("FROM app_settings")) {
      return { results: [] };
    }

    if (sql.startsWith("INSERT INTO image_generation_jobs")) {
      const [id, user_id, task, mode_, workflow_key] =
        values as [string, string, string, string, string];
      const prompt = sql.includes("input_keys") ? "" : (values[5] as string);
      const input_keys = sql.includes("input_keys") ? (values[5] as string) : null;
      const output_prefix = values[6] as string;
      const created_at = values[7] as number;
      const updated_at = values[8] as number;
      jobs.set(id, {
        completed_at: null,
        created_at,
        error_code: null,
        error_message: null,
        id,
        mode: mode_,
        model: null,
        output_content_type: null,
        output_key: null,
        output_prefix,
        prompt,
        input_keys,
        provider: null,
        provider_task_id: null,
        status: "pending",
        task,
        updated_at,
        user_id,
        workflow_key,
      });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT INTO companion_cutout_jobs")) {
      const [id, companion_id, user_id, source_art_url, image_job_id, created_at, updated_at] =
        values as [string, string, string | null, string, string, number, number];
      cutouts.set(id, {
        companion_id,
        completed_at: null,
        created_at,
        error_code: null,
        error_message: null,
        id,
        image_job_id,
        output_key: null,
        source_art_url,
        status: "pending",
        updated_at,
        user_id,
      });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT INTO story_moment_images")) {
      const [
        id,
        user_id,
        companion_id,
        thread_id,
        message_id,
        scene_id,
        activity_id,
        story_beat_id,
        emotion,
        prompt_snapshot,
        job_id,
        created_at,
        updated_at,
      ] = values as [
        string,
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        string | null,
        string,
        string,
        number,
        number,
      ];
      moments.set(id, {
        activity_id,
        companion_id,
        created_at,
        emotion,
        id,
        job_id,
        message_id,
        output_key: null,
        prompt_snapshot,
        scene_id,
        status: "queued",
        story_beat_id,
        thread_id,
        updated_at,
        user_id,
      });
      return { meta: { changes: 1 } };
    }

    if (sql.includes("FROM story_moment_images WHERE user_id = ? AND message_id = ?")) {
      const [userId, messageId] = values as [string, string];
      return (
        [...moments.values()].find((m) => m.user_id === userId && m.message_id === messageId) ?? null
      );
    }

    if (sql.includes("FROM story_moment_images WHERE job_id = ?")) {
      const [jobId] = values as [string];
      return [...moments.values()].find((m) => m.job_id === jobId) ?? null;
    }

    if (sql.includes("SELECT art_url, art_cutout_key FROM companions WHERE id = ?")) {
      const [id] = values as [string];
      return companions.get(id) ?? null;
    }

    if (sql.includes("FROM companions c") && sql.includes("LEFT JOIN companion_profile_images p")) {
      const [, id] = values as [string, string];
      return companions.get(id) ?? null;
    }

    if (sql.includes("FROM companion_cutout_jobs WHERE companion_id = ? AND source_art_url = ?")) {
      const [companionId, sourceArtUrl] = values as [string, string];
      return (
        [...cutouts.values()].find(
          (row) => row.companion_id === companionId && row.source_art_url === sourceArtUrl,
        ) ?? null
      );
    }

    if (sql.includes("FROM companion_cutout_jobs WHERE image_job_id = ?")) {
      const [imageJobId] = values as [string];
      return [...cutouts.values()].find((row) => row.image_job_id === imageJobId) ?? null;
    }

    if (sql.includes("FROM companion_cutout_jobs WHERE id = ?")) {
      const [id] = values as [string];
      return cutouts.get(id) ?? null;
    }

    if (sql.includes("FROM image_generation_jobs WHERE id = ?")) {
      const [id] = values as [string];
      return jobs.get(id) ?? null;
    }

    if (sql.startsWith("UPDATE image_generation_jobs SET")) {
      const setClause = sql.slice(sql.indexOf("SET ") + 4, sql.indexOf(" WHERE id = ?"));
      const cols = setClause.split(", ").map((c) => c.split(" = ")[0]!.trim());
      const id = values[values.length - 1] as string;
      const row = jobs.get(id);
      if (row) cols.forEach((col, i) => (row[col] = values[i]));
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE companion_cutout_jobs")) {
      const setClause = sql.slice(sql.indexOf("SET ") + 4, sql.indexOf(" WHERE id = ?"));
      const cols = setClause.split(", ").map((c) => c.split(" = ")[0]!.trim());
      const id = values[values.length - 1] as string;
      const row = cutouts.get(id);
      if (row) cols.forEach((col, i) => (row[col] = values[i]));
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE companions") && sql.includes("art_cutout_key")) {
      const [artCutoutKey, updatedAt, companionId, sourceArtUrl] =
        values as [string, number, string, string];
      const row = companions.get(companionId);
      if (row && row.art_url === sourceArtUrl) {
        row.art_cutout_key = artCutoutKey;
        row.updated_at = updatedAt;
      }
      return { meta: { changes: 1 } };
    }

    if (sql.includes("INSERT OR REPLACE INTO asset_objects")) {
      return { meta: { changes: 1 } };
    }

    if (mode === "all") return { results: [] };
    throw new Error(`Unrecognized SQL in moment-image test: ${sql}`);
  }

  const buildStatement = (sql: string, values: unknown[] = []) => ({
    all: async () => execute(sql, values, "all"),
    first: async () => execute(sql, values, "first"),
    run: async () => execute(sql, values, "run"),
  });

  const env = {
    ASSETS: {
      get: async (key: string) => {
        const bytes = assets.get(key);
        return bytes ? { arrayBuffer: async () => bytes.buffer, httpMetadata: {} } : null;
      },
      put: async (key: string, value: Uint8Array) => void assets.set(key, value),
    },
    DB: {
      prepare: (sql: string) => ({
        ...buildStatement(sql),
        bind: (...values: unknown[]) => buildStatement(sql, values),
      }),
    },
    JOB_QUEUE: { send: async (msg: unknown) => void queue.push(msg) },
  } as unknown as Env;

  return { assets, companions, cutouts, env, jobs, moments, queue };
}

function sampleContext(): MomentPromptContext {
  return {
    activity: { activity_hint: "sketching by the window", activity_type: "coffee", mood: "calm" },
    companion: {
      appearance: "long dark hair, soft sweater",
      gender: "female",
      name: "Maya",
      personality: "shy but warm",
      relationship_role: "friend",
    },
    emotion: "warm",
    previousUserText: "I ordered us two coffees",
    scene: { mood: "warm cafe", name: "Pier Coffee Shop", tags: ["cozy", "harbor"] },
    sourceReply: "<narration>Maya wraps her hands around the cup.</narration> Thank you.",
    stage: "familiar",
    storyBeat: { objective: "decide whether to show her sketch", title: "The Sketchbook" },
    timeSlot: "morning",
  };
}

describe("buildMomentPrompt", () => {
  it("includes scene, time slot, companion, emotion and narration-driven action", () => {
    const prompt = buildMomentPrompt(sampleContext());
    expect(prompt).toContain("Pier Coffee Shop");
    expect(prompt).toContain("morning");
    expect(prompt).toContain("Maya");
    expect(prompt).toContain("warm");
    expect(prompt).toContain("Maya wraps her hands around the cup");
    expect(prompt).toContain("familiar");
    expect(prompt).toContain("no text, no UI");
  });

  it("drops free-form user/story text that would summon extra people", () => {
    const prompt = buildMomentPrompt(sampleContext());
    // previousUserText and the story objective are intentionally excluded — as
    // edit instructions they name other people and the editor renders them.
    expect(prompt).not.toContain("ordered us two coffees");
    expect(prompt).not.toContain("The Sketchbook");
    expect(prompt).not.toContain("decide whether to show her sketch");
  });

  it("constrains scene moments to the companion only, looking at viewer", () => {
    const prompt = buildMomentPrompt(sampleContext());
    expect(prompt).toContain("single-character scene image");
    expect(prompt).toContain("Keep exactly one person in the image — this companion only");
    expect(prompt).toContain("Do not add any other people, a second person, the user, an opponent");
    expect(prompt).toContain("looks directly at the viewer");
    expect(prompt).toContain("do not render any camera, phone, or photographic device");
    expect(prompt).toContain("no extra characters");
    expect(prompt).not.toContain("first-person perspective from the user's point of view");
  });

  it("includes the companion's relationship role", () => {
    const prompt = buildMomentPrompt(sampleContext());
    expect(prompt).toContain("Relationship context: friend");
  });

  it("prioritizes a sanitized visual action without including the user's raw action", () => {
    const prompt = buildMomentPrompt({
      ...sampleContext(),
      previousUserText: "<narration>I offer you a small bouquet.</narration>These are for you.",
      sourceReply: "<narration>Maya blushes.</narration>Thank you.",
      visualAction: {
        expression: "warm shy smile",
        gaze: "looking directly at the viewer",
        hands: "both hands gently around the bouquet",
        pose: "standing slightly turned toward the viewer",
        props: "small bouquet",
        visible_action: "Maya holds a small bouquet close to her chest",
      },
    });

    expect(prompt).toContain("Render this exact visible moment");
    expect(prompt).toContain("Maya holds a small bouquet close to her chest");
    expect(prompt).toContain("small bouquet");
    expect(prompt).toContain("The viewer/user is not visible");
    expect(prompt).not.toContain("I offer you a small bouquet");
    expect(prompt).not.toContain("Maya blushes");
  });
});

describe("moment image job pipeline", () => {
  it("createMomentImageJob inserts a pending job + queued moment and enqueues", async () => {
    const { env, jobs, moments, queue } = createEnv();

    const { jobId, momentId } = await createMomentImageJob(env, {
      activityId: null,
      companionId: "maya",
      emotion: "warm",
      messageId: "msg_1",
      promptSnapshot: "a cinematic moment",
      sceneId: "scene_1",
      storyBeatId: null,
      threadId: "thr_1",
      userId: "usr_1",
    });

    const job = jobs.get(jobId)!;
    expect(job.status).toBe("pending");
    expect(job.task).toBe("chat_moment_image");
    expect(job.mode).toBe("text_to_image");
    expect(job.workflow_key).toBe("chat_moment");
    expect(job.output_prefix).toBe("chat-moments");

    const moment = moments.get(momentId)!;
    expect(moment.status).toBe("queued");
    expect(moment.message_id).toBe("msg_1");
    expect(moment.job_id).toBe(jobId);

    expect(queue).toEqual([
      expect.objectContaining({ job_id: jobId, type: "image.generate" }),
    ]);
  });

  it("createMomentImageJob enqueues a sceneless (null scene_id) moment", async () => {
    const { env, moments, queue } = createEnv();

    const { jobId, momentId } = await createMomentImageJob(env, {
      activityId: null,
      companionId: "maya",
      emotion: "warm",
      messageId: "msg_private",
      promptSnapshot: "a private-chat moment",
      sceneId: null,
      storyBeatId: null,
      threadId: "thr_1",
      userId: "usr_1",
    });

    expect(moments.get(momentId)!.scene_id).toBeNull();
    expect(queue).toEqual([
      expect.objectContaining({ job_id: jobId, type: "image.generate" }),
    ]);
  });

  it("createMomentImageJob marks the job failed and does not enqueue when the moment insert throws", async () => {
    const base = createEnv();
    const originalPrepare = (base.env.DB.prepare as (sql: string) => unknown).bind(base.env.DB);
    const env = {
      ...base.env,
      DB: {
        prepare: (sql: string) => {
          if (sql.startsWith("INSERT INTO story_moment_images")) {
            const fail = async () => {
              throw new Error("NOT NULL constraint failed: story_moment_images.scene_id");
            };
            return { all: fail, bind: () => ({ run: fail }), first: fail, run: fail };
          }
          return originalPrepare(sql);
        },
      },
    } as unknown as Env;

    await expect(
      createMomentImageJob(env, {
        activityId: null,
        companionId: "maya",
        emotion: "warm",
        messageId: "msg_boom",
        promptSnapshot: "a cinematic moment",
        sceneId: null,
        storyBeatId: null,
        threadId: "thr_1",
        userId: "usr_1",
      }),
    ).rejects.toThrow(/scene_id/);

    const job = [...base.jobs.values()][0]!;
    expect(job.status).toBe("failed");
    expect(job.error_code).toBe("moment_enqueue_failed");
    expect(base.queue).toEqual([]);
  });

  it("processMomentImageJob with mock provider writes R2 under chat-moments and succeeds", async () => {
    const { env, assets } = createEnv(); // no provider configured -> mock

    const { jobId } = await createMomentImageJob(env, {
      activityId: null,
      companionId: "maya",
      emotion: "warm",
      messageId: "msg_1",
      promptSnapshot: "a cinematic moment",
      sceneId: "scene_1",
      storyBeatId: null,
      threadId: "thr_1",
      userId: "usr_1",
    });

    await processMomentImageJob(env, jobId);

    const job = (await loadBaseArtJob(env, jobId)) as ImageGenJobRow;
    expect(job.status).toBe("succeeded");
    expect(job.output_key).toMatch(/^user-art\/usr_1\/chat-moments\/.+\.(png|webp)$/);
    expect(assets.has(job.output_key!)).toBe(true);
  });

  it("processMomentImageJob waits and creates a cutout job when base art has no cutout cache", async () => {
    const { env, assets, companions, cutouts, queue } = createEnv(); // no provider configured -> mock
    const artKey = "companions/official/maya/neutral.webp";
    companions.set("maya", { art_cutout_key: null, art_url: artKey });
    assets.set(artKey, Uint8Array.from([1, 2, 3, 4])); // mock provider reads source from R2

    const { jobId } = await createMomentImageJob(env, {
      activityId: null,
      companionId: "maya",
      emotion: "warm",
      messageId: "msg_3",
      promptSnapshot: "a cinematic moment",
      sceneId: "scene_1",
      storyBeatId: null,
      threadId: "thr_1",
      userId: "usr_1",
    });

    await processMomentImageJob(env, jobId);

    const job = (await loadBaseArtJob(env, jobId)) as ImageGenJobRow;
    expect(job.status).toBe("processing");
    expect(job.output_key).toBeNull();
    expect([...cutouts.values()]).toEqual([
      expect.objectContaining({
        companion_id: "maya",
        source_art_url: artKey,
        status: "pending",
      }),
    ]);
    expect(queue).toContainEqual(expect.objectContaining({ type: "image.generate" }));
  });

  it("createOrReuseCutoutJob rejects source art that is not available in R2", async () => {
    const { env } = createEnv();

    await expect(
      createOrReuseCutoutJob(env, {
        companionId: "maya",
        sourceArtUrl: "portraits/maya/neutral.webp",
        userId: "usr_1",
      }),
    ).rejects.toMatchObject({
      code: "source_art_not_available",
      message: "Source art is not available to image generation: portraits/maya/neutral.webp",
    } satisfies Partial<ImageGenError>);
  });

  it("processCutoutJob writes the companion cutout cache", async () => {
    const { env, assets, companions, cutouts } = createEnv(); // no provider configured -> mock
    const artKey = "companions/official/maya/neutral.webp";
    companions.set("maya", { art_cutout_key: null, art_url: artKey });
    assets.set(artKey, Uint8Array.from([1, 2, 3, 4]));

    const { jobId } = await createMomentImageJob(env, {
      activityId: null,
      companionId: "maya",
      emotion: "warm",
      messageId: "msg_cutout",
      promptSnapshot: "a cinematic moment",
      sceneId: "scene_1",
      storyBeatId: null,
      threadId: "thr_1",
      userId: "usr_1",
    });

    await processMomentImageJob(env, jobId);
    const cutout = [...cutouts.values()][0]!;
    const result = await processCutoutJob(env, cutout.image_job_id as string);

    expect(result).toEqual({ companionId: "maya" });
    expect(companions.get("maya")?.art_cutout_key).toMatch(
      /^user-art\/usr_1\/companion-cutout\/.+\.png$/,
    );
  });

  it("processMomentImageJob succeeds when the companion has a cached cutout", async () => {
    const { env, assets, companions } = createEnv(); // no provider configured -> mock
    const artKey = "companions/official/maya/neutral.webp";
    const cutoutKey = "user-art/usr_1/companion-cutout/cutout.png";
    companions.set("maya", { art_cutout_key: cutoutKey, art_url: artKey });
    assets.set(cutoutKey, Uint8Array.from([1, 2, 3, 4]));

    const { jobId } = await createMomentImageJob(env, {
      activityId: null,
      companionId: "maya",
      emotion: "warm",
      messageId: "msg_4",
      promptSnapshot: "a cinematic moment",
      sceneId: "scene_1",
      storyBeatId: null,
      threadId: "thr_1",
      userId: "usr_1",
    });

    await processMomentImageJob(env, jobId);

    const job = (await loadBaseArtJob(env, jobId)) as ImageGenJobRow;
    expect(job.status).toBe("succeeded");
  });

  it("loadMomentByMessage returns the persisted moment row", async () => {
    const { env } = createEnv();
    await createMomentImageJob(env, {
      activityId: null,
      companionId: "maya",
      emotion: null,
      messageId: "msg_2",
      promptSnapshot: "p",
      sceneId: "scene_1",
      storyBeatId: null,
      threadId: "thr_1",
      userId: "usr_1",
    });

    const row = (await loadMomentByMessage(env, "usr_1", "msg_2")) as StoryMomentImageRow;
    expect(row.message_id).toBe("msg_2");
    expect(row.scene_id).toBe("scene_1");
  });

  it("allows private chat moments without scene context", async () => {
    const { env } = createEnv();
    await createMomentImageJob(env, {
      activityId: null,
      companionId: "maya",
      emotion: "warm",
      messageId: "msg_private",
      promptSnapshot: "private chat moment",
      sceneId: null,
      storyBeatId: null,
      threadId: "thr_1",
      userId: "usr_1",
    });

    const row = (await loadMomentByMessage(env, "usr_1", "msg_private")) as StoryMomentImageRow;
    expect(row.message_id).toBe("msg_private");
    expect(row.scene_id).toBeNull();
  });
});
