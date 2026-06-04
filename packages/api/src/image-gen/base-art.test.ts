import { afterEach, describe, expect, it, vi } from "vitest";

import { createBaseArtJob, loadBaseArtJob, processBaseArtJob, type ImageGenJobRow } from "./base-art";
import { mockImageGenProvider } from "./mock-provider";

type Row = Record<string, unknown>;

function createEnv(extra: Record<string, unknown> = {}): {
  env: Env;
  jobs: Map<string, Row>;
  assets: Map<string, Uint8Array>;
  queue: unknown[];
  settings: Map<string, string>;
} {
  const jobs = new Map<string, Row>();
  const assets = new Map<string, Uint8Array>();
  const queue: unknown[] = [];
  const settings = new Map<string, string>();

  function execute(sql: string, values: unknown[], mode: "run" | "first" | "all"): unknown {
    if (sql.includes("FROM app_settings")) {
      return { results: [...settings.entries()].map(([key, value]) => ({ key, value })) };
    }

    if (sql.startsWith("INSERT INTO image_generation_jobs")) {
      const [
        id,
        user_id,
        task,
        mode_,
        workflow_key,
        prompt,
        ckpt_name,
        checkpoint_field_name,
        input_keys,
        output_prefix,
        created_at,
        updated_at,
      ] = values as [
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        string,
        number,
        number,
      ];
      jobs.set(id, {
        checkpoint_field_name,
        ckpt_name,
        completed_at: null,
        created_at,
        error_code: null,
        error_message: null,
        id,
        input_keys,
        mask_key: null,
        mode: mode_,
        model: null,
        negative_prompt: null,
        output_content_type: null,
        output_key: null,
        output_prefix,
        prompt,
        provider: null,
        provider_task_id: null,
        retry_count: 0,
        status: "pending",
        style: null,
        task,
        updated_at,
        user_id,
        workflow_key,
      });
      return { meta: { changes: 1 } };
    }

    if (sql.includes("FROM image_generation_jobs WHERE id = ?")) {
      const [id] = values as [string];
      return jobs.get(id) ?? null;
    }

    if (sql.includes("WHERE provider_task_id = ?")) {
      const [taskId] = values as [string];
      return [...jobs.values()].find((r) => r.provider_task_id === taskId) ?? null;
    }

    if (sql.startsWith("UPDATE image_generation_jobs SET")) {
      const setClause = sql.slice(sql.indexOf("SET ") + 4, sql.indexOf(" WHERE id = ?"));
      const cols = setClause.split(", ").map((c) => c.split(" = ")[0]!.trim());
      const id = values[values.length - 1] as string;
      const row = jobs.get(id);
      if (row) {
        cols.forEach((col, i) => {
          row[col] = values[i];
        });
      }
      return { meta: { changes: 1 } };
    }

    if (sql.includes("INSERT OR REPLACE INTO asset_objects")) {
      return { meta: { changes: 1 } };
    }

    if (mode === "all") return { results: [] };
    throw new Error(`Unrecognized SQL in base-art test: ${sql}`);
  }

  const buildStatement = (sql: string, values: unknown[] = []) => ({
    all: async () => execute(sql, values, "all"),
    first: async () => execute(sql, values, "first"),
    run: async () => execute(sql, values, "run"),
  });

  const prepare = (sql: string) => ({
    ...buildStatement(sql),
    bind: (...values: unknown[]) => buildStatement(sql, values),
  });

  const env = {
    ASSETS: {
      get: async (key: string) => {
        const bytes = assets.get(key);
        return bytes ? { arrayBuffer: async () => bytes.buffer, httpMetadata: {} } : null;
      },
      put: async (key: string, value: Uint8Array) => {
        assets.set(key, value);
      },
    },
    DB: { prepare },
    JOB_QUEUE: { send: async (msg: unknown) => void queue.push(msg) },
    ...extra,
  } as unknown as Env;

  return { assets, env, jobs, queue, settings };
}

describe("base-art job pipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createBaseArtJob inserts a pending row and enqueues image.generate", async () => {
    const { env, jobs, queue } = createEnv();

    const jobId = await createBaseArtJob(env, {
      prompt: "a calm girl",
      source: "text",
      workflowKey: "wf1",
      userId: "usr_1",
    });

    const row = jobs.get(jobId)!;
    expect(row.status).toBe("pending");
    expect(row.task).toBe("companion_base_art");
    expect(row.mode).toBe("text_to_image");
    expect(row.workflow_key).toBe("wf1");
    expect(queue).toEqual([
      expect.objectContaining({ job_id: jobId, type: "image.generate" }),
    ]);
  });

  it("processBaseArtJob with mock provider writes R2 and marks succeeded", async () => {
    const { env, assets } = createEnv(); // no IMAGE_GEN_PROVIDER -> mock

    const jobId = await createBaseArtJob(env, {
      prompt: "a calm girl",
      source: "text",
      workflowKey: "wf1",
      userId: "usr_1",
    });
    await processBaseArtJob(env, jobId);

    const job = (await loadBaseArtJob(env, jobId)) as ImageGenJobRow;
    expect(job.status).toBe("succeeded");
    expect(job.output_key).toMatch(/^user-art\/usr_1\/companion-base-art\/.+\.png$/);
    expect(assets.has(job.output_key!)).toBe(true);
  });

  it("prepends the global WF1 base prompt only for wf1, not other workflows", async () => {
    const captured: string[] = [];
    vi.spyOn(mockImageGenProvider, "generate").mockImplementation(async (req) => {
      captured.push(req.prompt ?? "");
      return {
        content_type: "image/png",
        image_bytes: new Uint8Array([1, 2, 3]),
        model: "spy",
        provider: "mock",
      };
    });

    const { env, settings } = createEnv();
    settings.set("image_gen.wf1_base_prompt", "STYLE_PREAMBLE");

    const wf1Job = await createBaseArtJob(env, {
      prompt: "a calm girl",
      source: "text",
      workflowKey: "wf1",
      userId: "usr_1",
    });
    await processBaseArtJob(env, wf1Job);

    const sceneJob = await createBaseArtJob(env, {
      prompt: "empty seaside cafe, no people",
      source: "text",
      workflowKey: "wf_scene",
      userId: "usr_1",
    });
    await processBaseArtJob(env, sceneJob);

    expect(captured[0]).toContain("STYLE_PREAMBLE");
    expect(captured[0]).toContain("Soft studio portrait");
    expect(captured[0]).toContain("a calm girl");
    expect(captured[1]).toBe("empty seaside cafe, no people");
  });

  it("processBaseArtJob with runninghub stays processing with provider_task_id", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-async-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { env, settings } = createEnv({
      IMAGE_GEN_PROVIDER: "runninghub",
      RUNNINGHUB_API_KEY: "k",
      RUNNINGHUB_WEBHOOK_URL: "https://dev.aiappsbox.com/api/webhooks/runninghub",
    });
    settings.set(
      "image_gen.workflows",
      JSON.stringify({
        wf1: { mode: "create", promptNodeId: "6", workflowId: "kr-workflow" },
      }),
    );

    const jobId = await createBaseArtJob(env, {
      prompt: "a calm girl",
      source: "text",
      workflowKey: "wf1",
      userId: "usr_1",
    });
    await processBaseArtJob(env, jobId);

    const job = (await loadBaseArtJob(env, jobId)) as ImageGenJobRow;
    expect(job.status).toBe("processing");
    expect(job.provider_task_id).toBe("rh-async-1");
    expect(job.output_key).toBeNull();
  });
});
