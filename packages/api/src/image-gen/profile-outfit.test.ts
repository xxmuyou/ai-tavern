import { describe, expect, it, vi } from "vitest";

import {
  TASK_PROFILE_OUTFIT_IMAGE,
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
    workflow_key: "wf_outfit",
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

  const env = {
    ASSETS: {
      get: vi.fn(async () => null),
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
            return null;
          },
          async run() {
            if (sql.startsWith("UPDATE image_generation_jobs SET")) {
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
  it("processes a profile outfit job and saves the output to user image assets", async () => {
    const { env, generations, jobs, r2, userAssets } = createEnv();

    await processProfileOutfitImageJob(env, "job-1");

    const job = jobs.get("job-1")!;
    expect(job.status).toBe("succeeded");
    expect(job.output_key).toMatch(/^user-art\/user-1\/profile-outfits\/.+\.png$/);
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
