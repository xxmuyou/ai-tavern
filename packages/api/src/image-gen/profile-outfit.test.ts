import { describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuthUser: async () => ({ email: "user@example.com", id: "user-1" }),
}));

import {
  TASK_PROFILE_OUTFIT_IMAGE,
  handleProfileOutfitRequest,
  processProfileOutfitImageJob,
} from "./profile-outfit";

type Row = Record<string, any>;

function createEnv() {
  const jobs = new Map<string, Row>();
  const generations = new Map<string, Row>();
  const userAssets = new Map<string, Row>();
  const r2 = new Map<string, Uint8Array>();
  const companions = new Map<string, Row>();

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
  companions.set("maya", { art_url: "portraits/maya/neutral.webp" });
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
                    canonical_art_url: companion.art_url,
                    profile_image_override: null,
                  }
                : null;
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
              const [id, userId, task, mode, workflowKey, prompt, outputPrefix, createdAt, updatedAt] =
                values as [string, string, string, string, string, string, string, number, number];
              jobs.set(id, {
                billing_ref: null,
                ckpt_name: null,
                completed_at: null,
                created_at: createdAt,
                error_code: null,
                error_message: null,
                id,
                input_keys: null,
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

  return { env, generations, jobs, r2, userAssets };
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

  it("writes the custom outfit prompt snapshot into the queued image job", async () => {
    const { env, generations, jobs } = createEnv();

    const response = await handleProfileOutfitRequest(
      new Request("https://api.test/companions/maya/profile-outfit/generate", {
        body: JSON.stringify({ prompt: "black oversized hoodie", source: "custom" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      env,
      "/companions/maya/profile-outfit/generate",
    );

    expect(response?.status).toBe(202);
    const body = (await response?.json()) as { generation_id: string; job_id: string; status: string };
    expect(body.status).toBe("queued");
    expect(jobs.get(body.job_id)?.prompt).toContain("Outfit request: black oversized hoodie.");
    expect(generations.get(body.generation_id)).toMatchObject({
      outfit_prompt: "black oversized hoodie",
      prompt_snapshot: expect.stringContaining("Outfit request: black oversized hoodie."),
      prompt_source: "custom",
    });
  });

  it("writes the recommended outfit prompt snapshot into the queued image job", async () => {
    const { env, generations, jobs } = createEnv();

    const recommendationsResponse = await handleProfileOutfitRequest(
      new Request("https://api.test/companions/maya/profile-outfit/recommendations"),
      env,
      "/companions/maya/profile-outfit/recommendations",
    );
    const recommendationsBody = (await recommendationsResponse?.json()) as {
      recommendations: { id: string; prompt: string }[];
    };
    const recommendation = recommendationsBody.recommendations[0]!;

    const response = await handleProfileOutfitRequest(
      new Request("https://api.test/companions/maya/profile-outfit/generate", {
        body: JSON.stringify({ recommendation_id: recommendation.id, source: "recommended" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      env,
      "/companions/maya/profile-outfit/generate",
    );

    expect(response?.status).toBe(202);
    const body = (await response?.json()) as { generation_id: string; job_id: string };
    expect(jobs.get(body.job_id)?.prompt).toContain(`Outfit request: ${recommendation.prompt}.`);
    expect(generations.get(body.generation_id)).toMatchObject({
      outfit_prompt: recommendation.prompt,
      prompt_snapshot: expect.stringContaining(`Outfit request: ${recommendation.prompt}.`),
      prompt_source: "recommended",
    });
  });

  it("processes a profile outfit job and saves the output to user image assets", async () => {
    const { env, generations, jobs, r2, userAssets } = createEnv();

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
});
