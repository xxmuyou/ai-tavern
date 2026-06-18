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

    if (sql.includes("COUNT(*) AS count") && sql.includes("FROM image_generation_jobs")) {
      return {
        count: [...jobs.values()].filter(
          (r) =>
            r.provider === "runninghub" &&
            r.status === "processing" &&
            r.provider_task_id != null,
        ).length,
      };
    }

    if (sql.includes("FROM image_workflow_model_loras wml")) {
      const [workflowKey, modelId, loraId] = values as [string, string, string];
      if (
        workflowKey === "portrait_create_lora" &&
        modelId === "anime_default" &&
        loraId === "anime_detail"
      ) {
        return {
          clip_strength: 0.6,
          default_clip_strength: 0.6,
          default_model_strength: 0.8,
          id: "anime_detail",
          label: "Anime Detail",
          lora_name: "detail.safetensors",
        };
      }
      return null;
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
        lora_id,
        lora_name,
        lora_model_strength,
        lora_clip_strength,
        generation_params_json,
        input_keys,
        output_prefix,
        billing_ref,
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
        string | null,
        number | null,
        number | null,
        string | null,
        string | null,
        string,
        string | null,
        number,
        number,
      ];
      jobs.set(id, {
        billing_ref,
        checkpoint_field_name,
        ckpt_name,
        completed_at: null,
        created_at,
        error_code: null,
        error_message: null,
        id,
        input_keys,
        lora_clip_strength,
        lora_id,
        lora_model_strength,
        lora_name,
        generation_params_json,
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
    JOB_QUEUE: {
      send: async (msg: unknown, options?: unknown) => {
        queue.push(options ? { msg, options } : msg);
      },
    },
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
      workflowKey: "portrait_create",
      userId: "usr_1",
    });

    const row = jobs.get(jobId)!;
    expect(row.status).toBe("pending");
    expect(row.task).toBe("companion_base_art");
    expect(row.mode).toBe("text_to_image");
    expect(row.workflow_key).toBe("portrait_create");
    expect(queue).toEqual([
      expect.objectContaining({ job_id: jobId, type: "image.generate" }),
    ]);
  });

  it("createBaseArtJob stores the selected checkpoint and generation params", async () => {
    const { env, jobs } = createEnv();

    const jobId = await createBaseArtJob(env, {
      checkpointFieldName: "ckpt_name",
      ckptName: "animagine.safetensors",
      generationParams: {
        batch_size: 2,
        height: 1280,
        seed: 42,
        size_preset: "portrait_3_5",
        width: 768,
      },
      modelId: "anime_default",
      prompt: "a calm girl",
      source: "text",
      workflowKey: "portrait_create",
      userId: "usr_1",
    });

    const row = jobs.get(jobId)!;
    expect(row.workflow_key).toBe("portrait_create");
    expect(row.ckpt_name).toBe("animagine.safetensors");
    expect(row.checkpoint_field_name).toBe("ckpt_name");
    expect(JSON.parse(String(row.generation_params_json))).toMatchObject({
      batch_size: 2,
      height: 1280,
      seed: 42,
      width: 768,
    });
  });

  it("createBaseArtJob resolves and stores the selected LoRA", async () => {
    const { env, jobs } = createEnv();

    const jobId = await createBaseArtJob(env, {
      checkpointFieldName: "ckpt_name",
      ckptName: "animagine.safetensors",
      loraId: "anime_detail",
      modelId: "anime_default",
      prompt: "a calm girl",
      source: "text",
      workflowKey: "portrait_create_lora",
      userId: "usr_1",
    });

    const row = jobs.get(jobId)!;
    expect(row.workflow_key).toBe("portrait_create_lora");
    expect(row.lora_id).toBe("anime_detail");
    expect(row.lora_name).toBe("detail.safetensors");
    expect(row.lora_model_strength).toBe(0.8);
    expect(row.lora_clip_strength).toBe(0.6);
  });

  it("processBaseArtJob with mock provider writes R2 and marks succeeded", async () => {
    const { env, assets } = createEnv(); // no IMAGE_GEN_PROVIDER -> mock

    const jobId = await createBaseArtJob(env, {
      prompt: "a calm girl",
      source: "text",
      workflowKey: "portrait_create",
      userId: "usr_1",
    });
    await processBaseArtJob(env, jobId);

    const job = (await loadBaseArtJob(env, jobId)) as ImageGenJobRow;
    expect(job.status).toBe("succeeded");
    expect(job.output_key).toMatch(/^user-art\/usr_1\/companion-base-art\/.+\.png$/);
    expect(assets.has(job.output_key!)).toBe(true);
  });

  it("prepends the global portrait create base prompt only for portrait_create", async () => {
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
    settings.set("image_gen.portrait_create_base_prompt", "STYLE_PREAMBLE");

    const portraitJob = await createBaseArtJob(env, {
      prompt: "a calm girl",
      source: "text",
      workflowKey: "portrait_create",
      userId: "usr_1",
    });
    await processBaseArtJob(env, portraitJob);

    const sceneJob = await createBaseArtJob(env, {
      prompt: "empty seaside cafe, no people",
      source: "text",
      workflowKey: "scene_background",
      userId: "usr_1",
    });
    await processBaseArtJob(env, sceneJob);

    expect(captured[0]).toContain("STYLE_PREAMBLE");
    expect(captured[0]).toContain("solo, 1 character");
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
          portrait_create: { mode: "create", promptNodeId: "6", workflowId: "portrait-workflow" },
      }),
    );

    const jobId = await createBaseArtJob(env, {
      prompt: "a calm girl",
      source: "text",
      workflowKey: "portrait_create",
      userId: "usr_1",
    });
    await processBaseArtJob(env, jobId);

    const job = (await loadBaseArtJob(env, jobId)) as ImageGenJobRow;
    expect(job.status).toBe("processing");
    expect(job.provider_task_id).toBe("rh-async-1");
    expect(job.output_key).toBeNull();
  });

  it("queues RunningHub jobs locally when active task cap is reached", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { env, jobs, queue, settings } = createEnv({
      IMAGE_GEN_PROVIDER: "runninghub",
      RUNNINGHUB_API_KEY: "k",
    });
    settings.set("image_gen.runninghub_max_active_tasks", "3");
    for (let i = 0; i < 3; i += 1) {
      jobs.set(`active-${i}`, {
        id: `active-${i}`,
        provider: "runninghub",
        provider_task_id: `rh-${i}`,
        status: "processing",
      });
    }

    const jobId = await createBaseArtJob(env, {
      prompt: "a calm girl",
      source: "text",
      workflowKey: "portrait_create",
      userId: "usr_1",
    });
    await processBaseArtJob(env, jobId);

    expect(fetchMock).not.toHaveBeenCalled();
    const job = jobs.get(jobId)!;
    expect(job).toMatchObject({
      error_code: "provider_queue_wait",
      error_message: "Queued",
      provider: "runninghub",
      retry_count: 1,
      status: "processing",
    });
    expect(queue[1]).toMatchObject({
      msg: { job_id: jobId, type: "image.generate" },
      options: { delaySeconds: 10 },
    });
  });

  it("requeues instead of failing when RunningHub reports TASK_QUEUE_MAXED", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 400, msg: "TASK_QUEUE_MAXED" }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { env, jobs, queue, settings } = createEnv({
      IMAGE_GEN_PROVIDER: "runninghub",
      RUNNINGHUB_API_KEY: "k",
    });
    settings.set(
      "image_gen.workflows",
      JSON.stringify({
        portrait_create: { mode: "create", promptNodeId: "6", workflowId: "portrait-workflow" },
      }),
    );

    const jobId = await createBaseArtJob(env, {
      prompt: "a calm girl",
      source: "text",
      workflowKey: "portrait_create",
      userId: "usr_1",
    });
    await processBaseArtJob(env, jobId);

    expect(fetchMock).toHaveBeenCalledOnce();
    const job = jobs.get(jobId)!;
    expect(job).toMatchObject({
      error_code: "provider_queue_wait",
      error_message: "Queued",
      retry_count: 1,
      status: "processing",
    });
    expect(queue[1]).toMatchObject({
      msg: { job_id: jobId, type: "image.generate" },
      options: { delaySeconds: 10 },
    });
  });

  it("processBaseArtJob sends checkpoint, LoRA, and generation params to RunningHub", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-lora-params-1", taskStatus: "QUEUED" } }),
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
        portrait_create_lora: {
          checkpointFieldName: "ckpt_name",
          checkpointNodeId: "1",
          generationParams: {
            batchSizeDefault: 1,
            batchSizeMax: 4,
            batchSizeMin: 1,
            batchSizeFieldName: "batch_size",
            defaultSizePresetId: "portrait_3_5",
            heightFieldName: "height",
            ksamplerNodeId: "6",
            latentNodeId: "5",
            seedFieldName: "seed",
            sizePresets: [{ height: 1280, id: "portrait_3_5", label: "Portrait 3:5", width: 768 }],
            widthFieldName: "width",
          },
          loraClipStrengthFieldName: "strength_clip",
          loraModelStrengthFieldName: "strength_model",
          loraNameFieldName: "file_name",
          loraNodeId: "2",
          mode: "create",
          promptFieldName: "text",
          promptNodeId: "3",
          workflowId: "portrait-lora-workflow",
        },
      }),
    );

    const jobId = await createBaseArtJob(env, {
      checkpointFieldName: "ckpt_name",
      ckptName: "animagine.safetensors",
      generationParams: {
        batch_size: 2,
        height: 1280,
        seed: 123,
        size_preset: "portrait_3_5",
        width: 768,
      },
      loraId: "anime_detail",
      modelId: "anime_default",
      prompt: "a calm girl",
      source: "text",
      workflowKey: "portrait_create_lora",
      userId: "usr_1",
    });
    await processBaseArtJob(env, jobId);

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.workflowId).toBe("portrait-lora-workflow");
    expect(body.nodeInfoList).toEqual(expect.arrayContaining([
      { fieldName: "ckpt_name", fieldValue: "animagine.safetensors", nodeId: "1" },
      { fieldName: "file_name", fieldValue: "detail.safetensors", nodeId: "2" },
      { fieldName: "strength_model", fieldValue: 0.8, nodeId: "2" },
      { fieldName: "strength_clip", fieldValue: 0.6, nodeId: "2" },
      { fieldName: "width", fieldValue: 768, nodeId: "5" },
      { fieldName: "height", fieldValue: 1280, nodeId: "5" },
      { fieldName: "batch_size", fieldValue: 2, nodeId: "5" },
      { fieldName: "seed", fieldValue: 123, nodeId: "6" },
    ]));
  });
});
