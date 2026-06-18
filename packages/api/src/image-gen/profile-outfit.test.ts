import { describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuthUser: async () => ({ email: "user@example.com", id: "user-1" }),
}));

import {
  TASK_PROFILE_OUTFIT_IMAGE,
  buildProfileRestylePrompt,
  getProfileRestyleRecommendations,
  handleProfileOutfitRequest,
  processProfileOutfitImageJob,
  reenqueueProfileOutfitJobsForCompanion,
} from "./profile-outfit";

type Row = Record<string, any>;

function createEnv() {
  const jobs = new Map<string, Row>();
  const generations = new Map<string, Row>();
  const userAssets = new Map<string, Row>();
  const r2 = new Map<string, Uint8Array>();
  const companions = new Map<string, Row>();
  const cutouts = new Map<string, Row>();

  jobs.set("job-1", {
    billing_ref: null,
    ckpt_name: null,
    completed_at: null,
    created_at: Date.now(),
    error_code: null,
    error_message: null,
    id: "job-1",
    input_keys: null,
    mask_key: null,
    mode: "image_to_image",
    model: null,
    negative_prompt: null,
    output_content_type: null,
    output_key: null,
    output_prefix: "profile-outfits",
    prompt: "profile outfit prompt",
    provider: null,
    provider_task_id: null,
    retry_count: 0,
    status: "pending",
    style: null,
    task: TASK_PROFILE_OUTFIT_IMAGE,
    updated_at: Date.now(),
    user_id: "user-1",
    workflow_key: "profile_outfit",
  });
  generations.set("gen-1", {
    companion_id: "maya",
    created_at: Date.now(),
    id: "gen-1",
    job_id: "job-1",
    outfit_prompt: "soft evening layers",
    output_key: null,
    prompt_snapshot: "profile outfit prompt",
    prompt_source: "custom",
    status: "queued",
    updated_at: Date.now(),
    user_id: "user-1",
  });
  companions.set("maya", { art_cutout_key: null, art_url: "portraits/maya/neutral.webp" });
  r2.set("portraits/maya/neutral.webp", new Uint8Array([1, 2, 3]));

  const env = {
    ASSETS: {
      get: vi.fn(async (key: string) => {
        const bytes = r2.get(key);
        return bytes
          ? {
              arrayBuffer: async () => bytes.buffer,
              httpMetadata: {},
            }
          : null;
      }),
      put: vi.fn(async (key: string, bytes: Uint8Array) => {
        r2.set(key, bytes);
      }),
    },
    DB: {
      prepare(sql: string) {
        const exec = (values: unknown[]) => ({
          async all() {
            if (sql.includes("FROM app_settings")) {
              return { results: [] };
            }
            if (sql.includes("FROM image_generation_jobs j") && sql.includes("JOIN profile_outfit_images p")) {
              const [companionId, task] = values as [string, string];
              const activeJobs: Row[] = [];
              for (const generation of generations.values()) {
                if (generation.companion_id !== companionId) continue;
                const job = jobs.get(generation.job_id);
                if (!job) continue;
                if (
                  job.task === task &&
                  (job.status === "pending" || job.status === "processing") &&
                  job.provider_task_id == null &&
                  job.output_key == null
                ) {
                  activeJobs.push(job);
                }
              }
              return {
                results: activeJobs
                  .sort((a, b) => a.created_at - b.created_at)
                  .slice(0, 20)
                  .map((job) => ({ id: job.id })),
              };
            }
            return { results: [] };
          },
          async first() {
            if (sql.includes("FROM image_generation_jobs WHERE id = ?")) {
              return jobs.get(values[0] as string) ?? null;
            }
            if (sql.includes("FROM profile_outfit_images WHERE job_id = ?")) {
              const jobId = values[0] as string;
              return [...generations.values()].find((row) => row.job_id === jobId) ?? null;
            }
            if (sql.includes("FROM profile_outfit_images") && sql.includes("status NOT IN")) {
              const [userId, companionId] = values as [string, string];
              return [...generations.values()]
                .filter((row) =>
                  row.user_id === userId &&
                  row.companion_id === companionId &&
                  row.status !== "succeeded" &&
                  row.status !== "failed" &&
                  row.status !== "cancelled",
                )
                .sort((a, b) => b.created_at - a.created_at)[0] ?? null;
            }
            if (sql.includes("FROM companions") && sql.includes("WHERE id = ?")) {
              const companion = companions.get(values[0] as string);
              return companion
                ? {
                    appearance: "long dark hair, soft cardigan",
                    created_by: null,
                    gender: "female",
                    id: values[0],
                    is_active: 1,
                    is_public: 1,
                    name: "Maya",
                    personality: "warm and observant",
                    relationship_role: "companion",
                    source: "official",
                    art_url: companion.art_url,
                  }
                : null;
            }
            if (sql.includes("FROM companions c") && sql.includes("LEFT JOIN companion_profile_images p")) {
              const companion = companions.get(values[1] as string);
              return companion
                ? {
                    art_url: companion.art_url,
                    art_cutout_key: companion.art_cutout_key ?? null,
                    canonical_art_url: companion.art_url,
                    profile_image_override: null,
                  }
                : null;
            }
            if (sql.includes("FROM companion_cutout_jobs WHERE companion_id = ? AND source_art_url = ?")) {
              const [companionId, sourceArtUrl] = values as [string, string];
              return [...cutouts.values()].find((row) =>
                row.companion_id === companionId && row.source_art_url === sourceArtUrl,
              ) ?? null;
            }
            if (sql.includes("FROM companion_cutout_jobs WHERE image_job_id = ?")) {
              const [imageJobId] = values as [string];
              return [...cutouts.values()].find((row) => row.image_job_id === imageJobId) ?? null;
            }
            if (sql.includes("FROM companion_cutout_jobs WHERE id = ?")) {
              return cutouts.get(values[0] as string) ?? null;
            }
            if (sql.includes("FROM relationships")) {
              return null;
            }
            if (sql.includes("FROM users WHERE id = ?")) {
              return { timezone: "UTC" };
            }
            return null;
          },
          async run() {
            if (sql.startsWith("INSERT INTO image_generation_jobs")) {
              const hasInputKeys = sql.includes("input_keys");
              const [id, userId, task, mode, workflowKey] =
                values as [string, string, string, string, string];
              const prompt = hasInputKeys ? "" : values[5] as string;
              const inputKeys = hasInputKeys ? values[5] as string : null;
              const outputPrefix = values[hasInputKeys ? 6 : 6] as string;
              const createdAt = values[hasInputKeys ? 7 : 7] as number;
              const updatedAt = values[hasInputKeys ? 8 : 8] as number;
              jobs.set(id, {
                billing_ref: null,
                ckpt_name: null,
                completed_at: null,
                created_at: createdAt,
                error_code: null,
                error_message: null,
                id,
                input_keys: inputKeys,
                mask_key: null,
                mode,
                model: null,
                negative_prompt: null,
                output_content_type: null,
                output_key: null,
                output_prefix: outputPrefix,
                prompt,
                provider: null,
                provider_task_id: null,
                retry_count: 0,
                status: "pending",
                style: null,
                task,
                updated_at: updatedAt,
                user_id: userId,
                workflow_key: workflowKey,
              });
            } else if (sql.startsWith("INSERT INTO companion_cutout_jobs")) {
              const [id, companionId, userId, sourceArtUrl, imageJobId, createdAt, updatedAt] =
                values as [string, string, string | null, string, string, number, number];
              cutouts.set(id, {
                companion_id: companionId,
                completed_at: null,
                created_at: createdAt,
                error_code: null,
                error_message: null,
                id,
                image_job_id: imageJobId,
                output_key: null,
                source_art_url: sourceArtUrl,
                status: "pending",
                updated_at: updatedAt,
                user_id: userId,
              });
            } else if (sql.startsWith("INSERT INTO profile_outfit_images")) {
              const [
                id,
                userId,
                companionId,
                promptSource,
                outfitPrompt,
                promptSnapshot,
                jobId,
                createdAt,
                updatedAt,
              ] = values as [string, string, string, string, string, string, string, number, number];
              generations.set(id, {
                companion_id: companionId,
                created_at: createdAt,
                id,
                job_id: jobId,
                outfit_prompt: outfitPrompt,
                output_key: null,
                prompt_snapshot: promptSnapshot,
                prompt_source: promptSource,
                status: "queued",
                updated_at: updatedAt,
                user_id: userId,
              });
            } else if (sql.startsWith("UPDATE image_generation_jobs SET")) {
              updateRow(sql, values, jobs);
            } else if (sql.startsWith("UPDATE profile_outfit_images SET")) {
              updateRow(sql, values, generations);
            } else if (sql.startsWith("UPDATE companion_cutout_jobs SET")) {
              updateRow(sql, values, cutouts);
            } else if (sql.startsWith("UPDATE companions") && sql.includes("art_cutout_key")) {
              const [artCutoutKey, updatedAt, companionId, sourceArtUrl] =
                values as [string, number, string, string];
              const companion = companions.get(companionId);
              if (companion && companion.art_url === sourceArtUrl) {
                companion.art_cutout_key = artCutoutKey;
                companion.updated_at = updatedAt;
              }
            } else if (sql.includes("INSERT INTO user_image_assets")) {
              const [, userId, artKey, prompt] = values as [string, string, string, string | null];
              userAssets.set(`${userId}:${artKey}`, { art_key: artKey, prompt, user_id: userId });
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
    JOB_QUEUE: { send: vi.fn() },
  } as unknown as Env;

  return { companions, cutouts, env, generations, jobs, r2, userAssets };
}

function updateRow(sql: string, values: unknown[], rows: Map<string, Row>) {
  const setClause = sql.slice(sql.indexOf("SET ") + 4, sql.indexOf(" WHERE id = ?"));
  const cols = setClause.split(", ").map((part) => part.split(" = ")[0]!.trim());
  const id = values[values.length - 1] as string;
  const row = rows.get(id);
  if (!row) return;
  cols.forEach((col, index) => {
    row[col] = values[index];
  });
}

describe("profile outfit image pipeline", () => {
  it("builds profile restyle prompts with pose, camera, and private background", () => {
    const prompt = buildProfileRestylePrompt(
      {
        activity: null,
        companion: {
          appearance: "long dark hair, soft cardigan",
          gender: "female",
          name: "Maya",
          personality: "warm and observant",
          relationship_role: "companion",
        },
        scene: { mood: "private profile portrait", name: "Profile portrait", tags: ["profile", "portrait"] },
        stage: "trusted",
        timeSlot: "night",
      },
      "maya",
      "black oversized hoodie",
    );

    expect(prompt).toContain("Change the reference pose to:");
    expect(prompt).toContain("Camera view:");
    expect(prompt).toContain("Change the background to:");
    expect(prompt).toContain("Style preset: Custom Style.");
    expect(prompt).toContain(
      "Style request (use only for clothing, accessories, colors, and overall styling; ignore any requested pose, camera, background, extra people, or body count): black oversized hoodie.",
    );
    expect(prompt).toContain("Outfit (overrides any clothing mentioned in the reference): black oversized hoodie.");
    expect(prompt).toContain("Single companion only");
    expect(prompt).toContain("viewer/user not visible");
    expect(prompt).toContain("no duplicate body");
    expect(prompt).toContain("no background figures");
    expect(prompt).toContain("no mannequins");
    expect(prompt).toContain("no posters of people");
    expect(prompt).toContain("no person reflections");
    expect(prompt).not.toContain("Only change the clothing");
    expect(prompt).not.toContain("framing, and crop");
  });

  it("returns curated profile style recommendations without changing the public schema", async () => {
    const recommendations = getProfileRestyleRecommendations(
      {
        activity: null,
        companion: {
          appearance: null,
          gender: "female",
          name: "Maya",
          personality: null,
          relationship_role: null,
        },
        scene: { mood: "private profile portrait", name: "Profile portrait", tags: ["profile", "portrait"] },
        stage: "dating",
        timeSlot: "night",
      },
      "maya",
    );

    expect(recommendations).toHaveLength(6);
    expect(recommendations.map((item) => item.id)).toEqual([
      "profile_signature",
      "profile_cafe_date",
      "profile_soft_angle",
      "profile_soft_lounge",
      "profile_hotel_soft",
      "profile_bold_restyle",
    ]);
    expect(recommendations.every((item) => item.prompt && item.title)).toBe(true);
    expect(recommendations.map((item) => item.title)).toEqual([
      "Studio Icon",
      "Cafe Date",
      "Soft Angle",
      "Lounge Glow",
      "Hotel Soft",
      "Neon Night",
    ]);
  });

  it("rejects profile outfit generation before enqueue when source art is missing from R2", async () => {
    const { env, generations, jobs, r2 } = createEnv();
    r2.delete("portraits/maya/neutral.webp");

    const response = await handleProfileOutfitRequest(
      new Request("https://api.test/companions/maya/profile-outfit/generate", {
        body: JSON.stringify({ prompt: "black oversized hoodie", source: "custom" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      env,
      "/companions/maya/profile-outfit/generate",
    );

    expect(response?.status).toBe(422);
    const body = (await response?.json()) as { error: string; key?: string };
    expect(body).toMatchObject({
      error: "source_art_not_available",
      key: "portraits/maya/neutral.webp",
    });
    expect([...jobs.values()].filter((row) => row.id !== "job-1")).toEqual([]);
    expect([...generations.values()].filter((row) => row.id !== "gen-1")).toEqual([]);
  });

  it("writes the custom style prompt snapshot into the queued image job with the safe studio preset", async () => {
    const { env, generations, jobs } = createEnv();

    const response = await handleProfileOutfitRequest(
      new Request("https://api.test/companions/maya/profile-outfit/generate", {
        body: JSON.stringify({
          prompt: "black oversized hoodie, beach background, rear camera view",
          source: "custom",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      env,
      "/companions/maya/profile-outfit/generate",
    );

    expect(response?.status).toBe(202);
    const body = (await response?.json()) as { generation_id: string; job_id: string; status: string };
    expect(body.status).toBe("queued");
    expect(jobs.get(body.job_id)?.prompt).toContain(
      "Style request (use only for clothing, accessories, colors, and overall styling; ignore any requested pose, camera, background, extra people, or body count): black oversized hoodie, beach background, rear camera view.",
    );
    expect(jobs.get(body.job_id)?.prompt).toContain(
      "Change the reference pose to: standing slight side turn, face toward viewer.",
    );
    expect(jobs.get(body.job_id)?.prompt).toContain("Camera view: front three-quarter portrait view.");
    expect(jobs.get(body.job_id)?.prompt).toContain(
      "Change the background to: private editorial profile studio, soft clean light, empty background.",
    );
    expect(jobs.get(body.job_id)?.prompt).not.toContain("Only change the clothing");
    expect(generations.get(body.generation_id)).toMatchObject({
      outfit_prompt: "black oversized hoodie, beach background, rear camera view",
      prompt_snapshot: expect.stringContaining("Change the background to:"),
      prompt_source: "custom",
    });
  });

  it("returns the latest unfinished profile outfit job for UI resume", async () => {
    const { env } = createEnv();

    const response = await handleProfileOutfitRequest(
      new Request("https://api.test/companions/maya/profile-outfit/latest"),
      env,
      "/companions/maya/profile-outfit/latest",
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      generation: {
        generation_id: "gen-1",
        job_id: "job-1",
        status: "pending",
      },
    });
  });

  it("writes fixed recommended style preset snapshots into queued image jobs", async () => {
    const expected: Record<string, { background: string; camera: string; pose: string; title: string }> = {
      profile_bold_restyle: {
        background: "plain private neon studio wall, abstract neon light strips, glossy colored light, empty background",
        camera: "dynamic angled composition",
        pose: "turning under neon light, one shoulder forward, confident stance",
        title: "Neon Night",
      },
      profile_cafe_date: {
        background: "quiet private cafe corner, warm window light",
        camera: "side-view table-side composition",
        pose: "expressive seated turn, face toward viewer",
        title: "Cafe Date",
      },
      profile_hotel_soft: {
        background: "soft private hotel room, clean layered bedding and warm bedside light",
        camera: "high-angle view from above, close intimate crop",
        pose: "half-reclining pose, torso slightly raised, face toward viewer",
        title: "Hotel Soft",
      },
      profile_signature: {
        background: "private editorial profile studio, soft clean light, empty background",
        camera: "front three-quarter portrait view",
        pose: "standing slight side turn, face toward viewer",
        title: "Studio Icon",
      },
      profile_soft_angle: {
        background: "warm private window-side room, clean table-side composition, soft daylight",
        camera: "high-angle table-side view",
        pose: "seated S-curve pose, torso angled, face toward viewer",
        title: "Soft Angle",
      },
      profile_soft_lounge: {
        background: "private sofa lounge at night, warm lamp light, empty background",
        camera: "low-angle sofa-side view from below eye level",
        pose: "reclining side pose, face toward viewer",
        title: "Lounge Glow",
      },
    };
    const banned = /back-facing over-the-shoulder|rear three-quarter over-the-shoulder/i;

    for (const id of Object.keys(expected)) {
      const { env, generations, jobs } = createEnv();
      const response = await handleProfileOutfitRequest(
        new Request("https://api.test/companions/maya/profile-outfit/generate", {
          body: JSON.stringify({ recommendation_id: id, source: "recommended" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        env,
        "/companions/maya/profile-outfit/generate",
      );

      expect(response?.status).toBe(202);
      const body = (await response?.json()) as { generation_id: string; job_id: string };
      const prompt = jobs.get(body.job_id)?.prompt ?? "";
      expect(prompt).toContain(`Style preset: ${expected[id]!.title}.`);
      expect(prompt).toContain(`Change the reference pose to: ${expected[id]!.pose}.`);
      expect(prompt).toContain(`Camera view: ${expected[id]!.camera}.`);
      expect(prompt).toContain(`Change the background to: ${expected[id]!.background}.`);
      expect(prompt).not.toMatch(banned);
      expect(prompt).not.toContain("Only change the clothing");
      expect(generations.get(body.generation_id)).toMatchObject({
        prompt_snapshot: expect.stringContaining(`Style preset: ${expected[id]!.title}.`),
        prompt_source: "recommended",
      });
    }
  });

  it("processes a profile outfit job and saves the output to user image assets", async () => {
    const { companions, env, generations, jobs, r2, userAssets } = createEnv();
    companions.get("maya")!.art_cutout_key = "user-art/user-1/companion-cutout/maya.png";
    r2.set("user-art/user-1/companion-cutout/maya.png", new Uint8Array([8, 9, 10]));

    await processProfileOutfitImageJob(env, "job-1");

    const job = jobs.get("job-1")!;
    expect(job.status).toBe("succeeded");
    expect(job.output_key).toMatch(/^user-art\/user-1\/profile-outfits\/.+\.webp$/);
    expect(r2.has(job.output_key)).toBe(true);

    const generation = generations.get("gen-1")!;
    expect(generation.status).toBe("succeeded");
    expect(generation.output_key).toBe(job.output_key);
    expect(userAssets.get(`user-1:${job.output_key}`)).toMatchObject({
      art_key: job.output_key,
      user_id: "user-1",
    });
  });

  it("waits and creates a cutout job when profile outfit has no cutout source yet", async () => {
    const { cutouts, env, generations, jobs } = createEnv();

    await processProfileOutfitImageJob(env, "job-1");

    const profileJob = jobs.get("job-1")!;
    expect(profileJob.status).toBe("processing");
    expect(profileJob.output_key).toBeNull();
    expect(generations.get("gen-1")?.status).toBe("processing");
    const cutout = [...cutouts.values()][0]!;
    expect(cutout).toMatchObject({
      companion_id: "maya",
      source_art_url: "portraits/maya/neutral.webp",
      status: "pending",
    });
    expect(jobs.get(cutout.image_job_id)?.task).toBe("companion_cutout");
    expect(env.JOB_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: cutout.image_job_id, type: "image.generate" }),
    );
  });

  it("fails profile outfit clearly when the matching cutout has already failed", async () => {
    const { cutouts, env, generations, jobs } = createEnv();
    cutouts.set("cutout-failed", {
      companion_id: "maya",
      completed_at: Date.now(),
      created_at: Date.now(),
      error_code: "cutout_failed",
      error_message: "Cutout model failed",
      id: "cutout-failed",
      image_job_id: "cutout-job-failed",
      output_key: null,
      source_art_url: "portraits/maya/neutral.webp",
      status: "failed",
      updated_at: Date.now(),
      user_id: "user-1",
    });

    await processProfileOutfitImageJob(env, "job-1");

    expect(jobs.get("job-1")).toMatchObject({
      error_code: "cutout_failed",
      error_message: "Cutout model failed",
      status: "failed",
    });
    expect(generations.get("gen-1")?.status).toBe("failed");
  });

  it("re-enqueues pending profile outfit jobs when a companion cutout completes", async () => {
    const { env, jobs } = createEnv();
    jobs.get("job-1")!.status = "processing";

    await reenqueueProfileOutfitJobsForCompanion(env, "maya");

    expect(env.JOB_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: "job-1", type: "image.generate" }),
      undefined,
    );
  });
});
