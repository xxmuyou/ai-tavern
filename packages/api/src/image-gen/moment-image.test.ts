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
      gender: "female",
      id: "maya",
      name: "Maya",
      personality: "shy but warm",
      relationship_role: "friend",
    },
    emotion: "warm",
    previousUserText: "I ordered us two coffees",
    privacy: "public" as const,
    scene: { mood: "warm cafe", name: "Pier Coffee Shop", tags: ["cozy", "harbor"] },
    sourceReply: "<narration>Maya wraps her hands around the cup.</narration> Thank you.",
    stage: "familiar",
    storyBeat: { objective: "decide whether to show her sketch", title: "The Sketchbook" },
    timeSlot: "morning",
  };
}

describe("buildMomentPrompt", () => {
  it("includes scene, time slot, gender anchor, emotion and a safe fallback pose", () => {
    const prompt = buildMomentPrompt(sampleContext());
    expect(prompt).toContain("Pier Coffee Shop");
    expect(prompt).toContain("morning");
    // The face is locked by the reference image, not by appearance text. Only a
    // one-word gender anchor remains in the prompt.
    expect(prompt).toContain("Companion gender: female");
    expect(prompt).not.toContain("long dark hair");
    expect(prompt).not.toContain("soft sweater");
    expect(prompt).not.toContain("identity reference");
    expect(prompt).toContain("warm");
    expect(prompt).toContain(
      "Change the reference pose to: standing three-quarter pose, face toward viewer",
    );
    expect(prompt).toContain("Do not keep the original portrait pose");
    expect(prompt).toContain("Camera view: front three-quarter view, medium angled shot");
    expect(prompt).toContain("Keep the face visible and recognizable");
    expect(prompt).toContain("Expression: soft genuine smile");
    expect(prompt).not.toContain("Gaze:");
    expect(prompt).not.toContain("Style profile: sharp urban");
    expect(prompt).not.toContain("Expression quality:");
    expect(prompt).not.toContain("Body attitude:");
    expect(prompt).not.toContain("Pose/body quality:");
    expect(prompt).not.toContain("Pose variety:");
    expect(prompt).not.toContain("Primary action rule:");
    // Fallback styling comes from the venue/stage preset (harbor tags ->
    // outdoor_public, familiar stage -> reserved tier), never a vague default.
    expect(prompt).toContain(
      "Outfit (overrides any clothing mentioned in the reference): fitted blouse with high-waisted shorts and polished accessories",
    );
    expect(prompt).toContain("Change the hairstyle to: high ponytail with a ribbon");
    expect(prompt).toContain("Makeup: fresh light makeup");
    expect(prompt).not.toContain("an outfit that naturally fits the scene");
    expect(prompt).not.toContain("Maya wraps her hands around the cup");
    expect(prompt).not.toContain("sketching by the window");
    expect(prompt).toContain("no text, no UI");
  });

  it("locks only facial identity and lets style follow the scene", () => {
    const prompt = buildMomentPrompt(sampleContext());
    expect(prompt).toContain("the same recognizable face and facial features");
    expect(prompt).toContain(
      "The hairstyle, outfit, expression, body pose, and camera framing may all change to match the new scene",
    );
    expect(prompt).toContain("Camera view:");
    // Abstract, non-visual metadata is kept out of the final image prompt.
    expect(prompt).not.toContain("Maya");
    expect(prompt).not.toContain("shy but warm");
    expect(prompt).not.toContain("Relationship context");
    expect(prompt).not.toContain("Body language fits");
    expect(prompt).toContain("this companion only");
  });

  it("drops free-form user/story text that would summon extra people", () => {
    const prompt = buildMomentPrompt(sampleContext());
    // previousUserText and the story objective are intentionally excluded — as
    // edit instructions they name other people and the editor renders them.
    expect(prompt).not.toContain("ordered us two coffees");
    expect(prompt).not.toContain("The Sketchbook");
    expect(prompt).not.toContain("decide whether to show her sketch");
  });

  it("constrains public scene moments to one companion in focus, looking at viewer", () => {
    const prompt = buildMomentPrompt(sampleContext());
    expect(prompt).toContain("single-character scene image");
    expect(prompt).toContain("Keep exactly one person in focus — this companion only");
    expect(prompt).toContain("Do not add a second main subject, the user, an opponent");
    expect(prompt).toContain("face remains visible and recognizable");
    expect(prompt).toContain("Do not render any camera, phone, or photographic device");
    expect(prompt).toContain("no second main character");
    expect(prompt).not.toContain("first-person perspective from the user's point of view");
  });

  it("allows distant blurred passersby in public scenes only", () => {
    const prompt = buildMomentPrompt(sampleContext());
    expect(prompt).toContain(
      "A few distant passersby may appear far behind, small and blurred, none near the companion",
    );
    expect(prompt).not.toContain("The background is empty of other people");
  });

  it("keeps the strict no-other-people wording for private scenes", () => {
    const prompt = buildMomentPrompt({
      ...sampleContext(),
      privacy: "private",
      scene: {
        mood: "hushed night suite",
        name: "Hotel Suite",
        tags: ["hotel", "bedroom", "intimate", "night"],
      },
    });
    expect(prompt).toContain("Keep exactly one person in the image — this companion only");
    expect(prompt).toContain("Do not add any other people, a second person, the user, an opponent");
    expect(prompt).toContain("The background is empty of other people");
    expect(prompt).toContain("Camera view: high-angle view from above, close intimate crop");
    expect(prompt).toContain("no extra characters");
    expect(prompt).not.toContain("distant passersby");
  });

  it("unlocks bolder fallback styling for intimate stages in private bedroom scenes", () => {
    const prompt = buildMomentPrompt({
      ...sampleContext(),
      privacy: "private",
      scene: {
        mood: "hushed night suite",
        name: "Hotel Suite",
        tags: ["hotel", "bedroom", "intimate", "night"],
      },
      stage: "committed",
      visualAction: null,
    });
    expect(prompt).toContain(
      "Outfit (overrides any clothing mentioned in the reference): strappy satin short nightdress under an open robe",
    );
    expect(prompt).toContain("Change the hairstyle to: damp tousled hair");
  });

  it("renders a scene-appropriate outfit from the visual action", () => {
    const prompt = buildMomentPrompt({
      ...sampleContext(),
      visualAction: {
        body_pose: "standing three-quarter pose, face toward viewer",
        camera_view: "side-view composition",
        outfit: "light summer dress",
      },
    });
    expect(prompt).toContain("Camera view: side-view composition");
    expect(prompt).toContain(
      "Outfit (overrides any clothing mentioned in the reference): light summer dress",
    );
    // The extractor delivered no hairstyle, so the preset fills it in to make
    // sure the look still visibly changes from the reference image.
    expect(prompt).toContain("Change the hairstyle to: high ponytail with a ribbon");
  });

  it("keeps extractor styling untouched when outfit and hairstyle are present", () => {
    const prompt = buildMomentPrompt({
      ...sampleContext(),
      visualAction: {
        body_pose: "leaning pose, face toward viewer",
        camera_view: "rear three-quarter over-the-shoulder view",
        hairstyle: "wind-blown loose waves",
        outfit: "flowy white sundress",
      },
    });
    expect(prompt).toContain(
      "Outfit (overrides any clothing mentioned in the reference): flowy white sundress",
    );
    expect(prompt).toContain("Change the hairstyle to: wind-blown loose waves");
    expect(prompt).toContain("Camera view: rear three-quarter over-the-shoulder view");
    expect(prompt).not.toContain("playful sundress with sneakers");
  });

  it("prioritizes a sanitized visual action without including the user's raw action", () => {
    const prompt = buildMomentPrompt({
      ...sampleContext(),
      previousUserText: "<narration>You offer a small bouquet.</narration>These are for you.",
      sourceReply: "<narration>Maya blushes.</narration>Thank you.",
      visualAction: {
        body_pose: "standing slightly turned toward the viewer",
        camera_view: "front three-quarter view, medium angled shot",
        expression: "warm shy smile",
        prop_name: "small bouquet",
        prop_relation: "held_in_one_hand",
      },
    });

    expect(prompt).toContain("Change the reference pose to: standing slightly turned toward the viewer");
    expect(prompt).toContain("Camera view: front three-quarter view, medium angled shot");
    expect(prompt).toContain("Prop: one small bouquet held in one hand. Other hand relaxed and visible.");
    expect(prompt).toContain("viewer/user not visible");
    expect(prompt).not.toContain("Position in scene:");
    expect(prompt).not.toContain("Hands/props:");
    expect(prompt).not.toContain("both hands");
    expect(prompt).not.toContain("Render this exact visible moment");
    expect(prompt).not.toContain("You offer a small bouquet");
    expect(prompt).not.toContain("Maya blushes");
  });

  it("renders nearby props with relaxed hands and no free-form hand wording", () => {
    const prompt = buildMomentPrompt({
      ...sampleContext(),
      visualAction: {
        body_pose: "expressive seated turn, face toward viewer",
        camera_view: "high-angle table-side view",
        expression: "curious slight smile",
        outfit: "fitted knit mini dress with sheer stockings",
        prop_name: "iced americano glass",
        prop_relation: "nearby_on_table",
      },
    });

    expect(prompt).toContain("Camera view: high-angle table-side view");
    expect(prompt).toContain("Prop: one iced americano glass nearby in the scene, not held. Hands relaxed and natural.");
    expect(prompt).not.toContain("Hands/props:");
    expect(prompt).not.toContain("on the table");
    expect(prompt).not.toContain("fingers wrapped");
    expect(prompt).not.toContain("both hands");
    expect(prompt.match(/iced americano glass/g)).toHaveLength(1);
  });

  it("renders camera view as composition without summoning a physical camera", () => {
    const prompt = buildMomentPrompt({
      ...sampleContext(),
      privacy: "private",
      scene: {
        mood: "soft sofa lounge",
        name: "Private Lounge",
        tags: ["home", "lounge", "intimate", "night"],
      },
      visualAction: {
        body_pose: "reclining side pose, face toward viewer",
        camera_view: "low-angle sofa-side view from below eye level",
        expression: "teasing half-smile",
        outfit: "fitted lounge dress",
      },
    });

    expect(prompt).toContain("Camera view: low-angle sofa-side view from below eye level. Keep the face visible and recognizable.");
    expect(prompt).toContain("Do not render any camera, phone, or photographic device");
    expect(prompt).toContain("no visible camera or photographic device");
    expect(prompt).not.toContain("viewfinder");
    expect(prompt).not.toContain("selfie");
  });

  it("never falls back to raw narration for risky intimate body actions", () => {
    const prompt = buildMomentPrompt({
      ...sampleContext(),
      sourceReply:
        "<narration>Maya slid off your lap, pulling the sheet ar</narration>I'm fine.",
      visualAction: null,
    });

    expect(prompt).toContain(
      "Change the reference pose to: standing three-quarter pose, face toward viewer",
    );
    expect(prompt).toContain(
      "Outfit (overrides any clothing mentioned in the reference): fitted blouse with high-waisted shorts and polished accessories",
    );
    expect(prompt).toContain("Expression: soft genuine smile");
    expect(prompt).not.toContain("slid off");
    expect(prompt).not.toContain("lap");
    expect(prompt).not.toContain("sheet ar");
    expect(prompt).not.toContain("The companion's pose and action");
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
