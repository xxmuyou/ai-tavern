import { afterEach, describe, expect, it, vi } from "vitest";

import { getImageGenProvider, parseWorkflows, workflowHasCheckpointNode } from ".";
import { ANATOMY_NEGATIVE } from "./prompts";
import { ImageGenError, type ImageGenRequest } from "./types";

describe("runningHubImageGenProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads the source image then creates a task referencing its fileName", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/task/openapi/upload")) {
        return new Response(
          JSON.stringify({ code: 0, msg: "success", data: { fileName: "api/abc123.webp" } }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          code: 0,
          msg: "success",
          data: { taskId: "rh-task-1", taskStatus: "QUEUED" },
        }),
        { headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = await getImageGenProvider(createEnv(), "variation");
    const result = await provider.generate(createRequest(), createEnv());

    expect(result).toEqual({
      external_task_id: "rh-task-1",
      model: "companion-expression-pack-v1",
      provider: "runninghub",
      type: "pending",
    });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    // First call uploads the source bytes as multipart form-data.
    const [uploadUrl, uploadInit] = calls[0]!;
    expect(uploadUrl).toBe("https://www.runninghub.ai/task/openapi/upload");
    expect(uploadInit.method).toBe("POST");
    expect(uploadInit.body).toBeInstanceOf(FormData);
    const uploadForm = uploadInit.body as unknown as FormData;
    expect(uploadForm.get("fileType")).toBe("image");
    expect(uploadForm.get("apiKey")).toBe("runninghub-api-key");
    expect(uploadForm.get("file")).toBeInstanceOf(Blob);

    // Second call creates the task and references the uploaded fileName.
    const [createUrl, createInit] = calls[1]!;
    expect(createUrl).toBe("https://www.runninghub.ai/task/openapi/create");
    const body = JSON.parse(String((createInit as RequestInit).body));
    expect(body.workflowId).toBe("workflow-1");
    expect(body.webhookUrl).toBe(
      "https://dev.aiappsbox.com/api/webhooks/runninghub?secret=webhook-secret",
    );
    expect(body.nodeInfoList).toEqual([
      { fieldName: "image", fieldValue: "api/abc123.webp", nodeId: "load-image-node" },
      { fieldName: "prompt", fieldValue: "make a warm portrait", nodeId: "prompt-node" },
    ]);
  });

  it("injects the anti-deformity negative prompt when the workflow declares a negative node", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/task/openapi/upload")) {
        return new Response(
          JSON.stringify({ code: 0, data: { fileName: "api/abc123.webp" } }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-task-neg", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          portrait_variation: {
            mode: "variation",
            workflowId: "workflow-1",
            promptNodeId: "prompt-node",
            promptFieldName: "prompt",
            loadImageNodeId: "load-image-node",
            negativePromptNodeId: "neg-node",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "variation")).generate(createRequest(), env);

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[1]![1].body));
    expect(body.nodeInfoList).toEqual([
      { fieldName: "image", fieldValue: "api/abc123.webp", nodeId: "load-image-node" },
      { fieldName: "prompt", fieldValue: "make a warm portrait", nodeId: "prompt-node" },
      { fieldName: "prompt", fieldValue: ANATOMY_NEGATIVE, nodeId: "neg-node" },
    ]);
  });

  it("creates a cutout task with only the uploaded source image when prompt node is absent", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/task/openapi/upload")) {
        return new Response(
          JSON.stringify({ code: 0, data: { fileName: "api/cutout-source.webp" } }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-cutout-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          companion_cutout: {
            mode: "cutout",
            workflowId: "cutout-workflow",
            loadImageNodeId: "load-image-node",
          },
        }),
      },
    );

    const result = await (await getImageGenProvider(env, "cutout", "companion_cutout")).generate(
      {
        mode: "cutout",
        source_art_url: "companions/user/u1/neutral.webp",
        workflow_key: "companion_cutout",
      },
      env,
    );

    expect(result).toEqual({
      external_task_id: "rh-cutout-1",
      model: "companion-cutout-companion_cutout",
      provider: "runninghub",
      type: "pending",
    });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[1]![1].body));
    expect(body.workflowId).toBe("cutout-workflow");
    expect(body.nodeInfoList).toEqual([
      { fieldName: "image", fieldValue: "api/cutout-source.webp", nodeId: "load-image-node" },
    ]);
  });

  it("creates a cutout task with a signed source URL when the load-image node accepts url", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-cutout-url-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          companion_cutout: {
            mode: "cutout",
            workflowId: "cutout-url-workflow",
            loadImageNodeId: "1",
            loadImageFieldName: "url",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "cutout", "companion_cutout")).generate(
      {
        mode: "cutout",
        source_art_url: "companions/user/u1/neutral.webp",
        workflow_key: "companion_cutout",
      },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.workflowId).toBe("cutout-url-workflow");
    expect(body.nodeInfoList).toEqual([
      {
        fieldName: "url",
        fieldValue: expect.stringMatching(
          /^https:\/\/dev\.aiappsbox\.com\/api\/objects\/signed\/companions%2Fuser%2Fu1%2Fneutral\.webp\?exp=\d+&sig=[a-f0-9]{64}$/,
        ),
        nodeId: "1",
      },
    ]);
  });

  it("creates a chat moment task with a signed source URL when the load-image node accepts url", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-moment-url-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          chat_moment: {
            architecture: "none",
            mode: "create",
            workflowId: "moment-url-workflow",
            promptNodeId: "13",
            promptFieldName: "prompt",
            loadImageNodeId: "1",
            loadImageFieldName: "url",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "create", "chat_moment")).generate(
      {
        mode: "create",
        prompt: "a quiet cafe",
        source_art_url: "companions/user/u1/cutout.png",
        workflow_key: "chat_moment",
      },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.workflowId).toBe("moment-url-workflow");
    expect(body.nodeInfoList).toEqual([
      {
        fieldName: "url",
        fieldValue: expect.stringMatching(
          /^https:\/\/dev\.aiappsbox\.com\/api\/objects\/signed\/companions%2Fuser%2Fu1%2Fcutout\.png\?exp=\d+&sig=[a-f0-9]{64}$/,
        ),
        nodeId: "1",
      },
      { fieldName: "prompt", fieldValue: "a quiet cafe", nodeId: "13" },
    ]);
  });

  it("creates a chat moment task with a signed source URL for LoadImageFromUrl.image", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-moment-image-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          chat_moment: {
            contractJson: JSON.stringify({
              nodes: [
                { class_type: "LoadImageFromUrl", inputs: ["image", "url"], nodeId: "1" },
                { class_type: "TextEncodeQwenImageEditPlus", inputs: ["prompt"], nodeId: "13" },
              ],
              version: 1,
            }),
            loadImageFieldName: "image",
            loadImageNodeId: "1",
            mode: "create",
            promptFieldName: "prompt",
            promptNodeId: "13",
            workflowId: "moment-image-workflow",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "create", "chat_moment")).generate(
      {
        mode: "create",
        prompt: "a quiet cafe",
        source_art_url: "companions/user/u1/cutout.png",
        workflow_key: "chat_moment",
      },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.workflowId).toBe("moment-image-workflow");
    expect(body.nodeInfoList).toEqual([
      {
        fieldName: "image",
        fieldValue: expect.stringMatching(
          /^https:\/\/dev\.aiappsbox\.com\/api\/objects\/signed\/companions%2Fuser%2Fu1%2Fcutout\.png\?exp=\d+&sig=[a-f0-9]{64}$/,
        ),
        nodeId: "1",
      },
      { fieldName: "prompt", fieldValue: "a quiet cafe", nodeId: "13" },
    ]);
  });

  it("creates a profile outfit task with a signed source URL when the load-image node accepts url", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-outfit-url-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          profile_outfit: {
            architecture: "none",
            mode: "variation",
            workflowId: "outfit-url-workflow",
            promptNodeId: "13",
            promptFieldName: "prompt",
            loadImageNodeId: "1",
            loadImageFieldName: "url",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "variation", "profile_outfit")).generate(
      {
        mode: "variation",
        prompt: "change outfit to a black dress",
        source_art_url: "companions/user/u1/profile.webp",
        workflow_key: "profile_outfit",
      },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.workflowId).toBe("outfit-url-workflow");
    expect(body.nodeInfoList).toEqual([
      {
        fieldName: "url",
        fieldValue: expect.stringMatching(
          /^https:\/\/dev\.aiappsbox\.com\/api\/objects\/signed\/companions%2Fuser%2Fu1%2Fprofile\.webp\?exp=\d+&sig=[a-f0-9]{64}$/,
        ),
        nodeId: "1",
      },
      { fieldName: "prompt", fieldValue: "change outfit to a black dress", nodeId: "13" },
    ]);
  });

  it("creates a profile outfit task with a signed source URL for LoadImageFromUrl.image", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-outfit-image-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          profile_outfit: {
            architecture: "none",
            contractJson: JSON.stringify({
              nodes: [
                { class_type: "LoadImageFromUrl", inputs: ["image", "url"], nodeId: "1" },
                { class_type: "TextEncodeQwenImageEditPlus", inputs: ["prompt"], nodeId: "13" },
              ],
              version: 1,
            }),
            loadImageFieldName: "image",
            loadImageNodeId: "1",
            mode: "variation",
            promptFieldName: "prompt",
            promptNodeId: "13",
            workflowId: "outfit-image-workflow",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "variation", "profile_outfit")).generate(
      {
        mode: "variation",
        prompt: "change outfit to a black dress",
        source_art_url: "companions/user/u1/profile.webp",
        workflow_key: "profile_outfit",
      },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.workflowId).toBe("outfit-image-workflow");
    expect(body.nodeInfoList).toEqual([
      {
        fieldName: "image",
        fieldValue: expect.stringMatching(
          /^https:\/\/dev\.aiappsbox\.com\/api\/objects\/signed\/companions%2Fuser%2Fu1%2Fprofile\.webp\?exp=\d+&sig=[a-f0-9]{64}$/,
        ),
        nodeId: "1",
      },
      { fieldName: "prompt", fieldValue: "change outfit to a black dress", nodeId: "13" },
    ]);
  });

  it("creates a portrait create create task overriding only the prompt node", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-create-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          portrait_create: { mode: "create", promptNodeId: "6", workflowId: "portrait-workflow" },
        }),
      },
    );

    const result = await (await getImageGenProvider(env, "create")).generate(
      { mode: "create", prompt: "a calm girl in a sweater", workflow_key: "portrait_create" },
      env,
    );

    expect(result).toEqual({
      external_task_id: "rh-create-1",
      model: "companion-create-portrait_create",
      provider: "runninghub",
      type: "pending",
    });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.workflowId).toBe("portrait-workflow");
    expect(body.nodeInfoList).toEqual([
      { fieldName: "text", fieldValue: "a calm girl in a sweater", nodeId: "6" },
    ]);
    expect(body.instanceType).toBeUndefined();
  });

  it("passes RunningHub plus instanceType when configured for the workflow", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-plus-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          chat_moment: {
            instanceType: "plus",
            mode: "create",
            promptNodeId: "13",
            promptFieldName: "prompt",
            workflowId: "moment-plus-workflow",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "create")).generate(
      { mode: "create", prompt: "a quiet cafe", workflow_key: "chat_moment" },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body).toMatchObject({
      instanceType: "plus",
      workflowId: "moment-plus-workflow",
    });
  });

  it("injects the negative prompt on the create path (chat_moment) when configured", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-moment-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          chat_moment: {
            mode: "create",
            promptNodeId: "13",
            promptFieldName: "prompt",
            workflowId: "moment-workflow",
            negativePromptNodeId: "14",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "create")).generate(
      { mode: "create", prompt: "a quiet cafe", workflow_key: "chat_moment" },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.nodeInfoList).toEqual([
      { fieldName: "prompt", fieldValue: "a quiet cafe", nodeId: "13" },
      { fieldName: "prompt", fieldValue: ANATOMY_NEGATIVE, nodeId: "14" },
    ]);
  });

  it("injects the checkpoint using the workflow field name and selected file", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-create-2", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          portrait_create: {
            mode: "create",
            promptNodeId: "6",
            workflowId: "portrait-workflow",
            checkpointNodeId: "4",
            checkpointFieldName: "ckpt_name",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "create")).generate(
      {
        mode: "create",
        prompt: "x",
        workflow_key: "portrait_create",
        ckpt_name: "myCustom.safetensors",
        checkpoint_field_name: "Anime_JP",
      },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.nodeInfoList).toEqual([
      { fieldName: "text", fieldValue: "x", nodeId: "6" },
      { fieldName: "ckpt_name", fieldValue: "myCustom.safetensors", nodeId: "4" },
    ]);
  });

  it("does not inject a checkpoint when the request has no ckpt_name", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-create-2b", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          portrait_create: {
            mode: "create",
            promptNodeId: "6",
            workflowId: "portrait-workflow",
            checkpointNodeId: "4",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "create")).generate(
      { mode: "create", prompt: "x", workflow_key: "portrait_create" },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.nodeInfoList).toEqual([{ fieldName: "text", fieldValue: "x", nodeId: "6" }]);
  });

  it("rejects enqueue when nodeInfoList does not match the workflow contract", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          portrait_create: {
            mode: "create",
            promptNodeId: "6",
            promptFieldName: "text",
            workflowId: "portrait-workflow",
            contractJson: JSON.stringify({
              nodes: [{ inputs: ["prompt"], nodeId: "6" }],
              version: 1,
            }),
          },
        }),
      },
    );

    await expect(
      (await getImageGenProvider(env, "create")).generate(
        { mode: "create", prompt: "x", workflow_key: "portrait_create" },
        env,
      ),
    ).rejects.toMatchObject({ code: "workflow_contract_mismatch", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to ckpt_name field name when the model omits one", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-create-2c", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          portrait_create: {
            mode: "create",
            promptNodeId: "6",
            workflowId: "portrait-workflow",
            checkpointNodeId: "4",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "create")).generate(
      { mode: "create", prompt: "x", workflow_key: "portrait_create", ckpt_name: "model.safetensors" },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.nodeInfoList).toEqual([
      { fieldName: "text", fieldValue: "x", nodeId: "6" },
      { fieldName: "ckpt_name", fieldValue: "model.safetensors", nodeId: "4" },
    ]);
  });

  it("injects one LoRA using workflow contract fields", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-lora-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          portrait_create: {
            mode: "create",
            promptNodeId: "6",
            promptFieldName: "text",
            workflowId: "portrait-workflow",
            loraNodeId: "12",
            loraNameFieldName: "lora_name",
            loraModelStrengthFieldName: "strength_model",
            loraClipStrengthFieldName: "strength_clip",
            contractJson: JSON.stringify({
              nodes: [
                { inputs: ["text"], nodeId: "6" },
                { inputs: ["lora_name", "strength_clip", "strength_model"], nodeId: "12" },
              ],
              version: 1,
            }),
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "create")).generate(
      {
        lora_clip_strength: 0.6,
        lora_model_strength: 0.8,
        lora_name: "detail.safetensors",
        mode: "create",
        prompt: "x",
        workflow_key: "portrait_create",
      },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.nodeInfoList).toEqual([
      { fieldName: "text", fieldValue: "x", nodeId: "6" },
      { fieldName: "lora_name", fieldValue: "detail.safetensors", nodeId: "12" },
      { fieldName: "strength_model", fieldValue: 0.8, nodeId: "12" },
      { fieldName: "strength_clip", fieldValue: 0.6, nodeId: "12" },
    ]);
  });

  it("injects configured latent and KSampler generation parameters", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-params-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          portrait_create: {
            checkpointNodeId: "1",
            checkpointFieldName: "ckpt_name",
            contractJson: JSON.stringify({
              nodes: [
                { inputs: ["ckpt_name"], nodeId: "1" },
                { inputs: ["file_name", "strength_model"], nodeId: "2" },
                { inputs: ["text"], nodeId: "3" },
                { inputs: ["batch_size", "height", "width"], nodeId: "5" },
                { inputs: ["seed"], nodeId: "6" },
              ],
              version: 1,
            }),
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
            loraModelStrengthFieldName: "strength_model",
            loraNameFieldName: "file_name",
            loraNodeId: "2",
            mode: "create",
            promptFieldName: "text",
            promptNodeId: "3",
            workflowId: "portrait-workflow",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "create")).generate(
      {
        ckpt_name: "model.safetensors",
        generation_params: {
          batch_size: 2,
          height: 1280,
          seed: 123456,
          size_preset: "portrait_3_5",
          width: 768,
        },
        lora_model_strength: 0.7,
        lora_name: "detail.safetensors",
        mode: "create",
        prompt: "x",
        workflow_key: "portrait_create",
      },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.nodeInfoList).toEqual([
      { fieldName: "text", fieldValue: "x", nodeId: "3" },
      { fieldName: "ckpt_name", fieldValue: "model.safetensors", nodeId: "1" },
      { fieldName: "file_name", fieldValue: "detail.safetensors", nodeId: "2" },
      { fieldName: "strength_model", fieldValue: 0.7, nodeId: "2" },
      { fieldName: "width", fieldValue: 768, nodeId: "5" },
      { fieldName: "height", fieldValue: 1280, nodeId: "5" },
      { fieldName: "batch_size", fieldValue: 2, nodeId: "5" },
      { fieldName: "seed", fieldValue: 123456, nodeId: "6" },
    ]);
  });

  it("fails create when ckpt_name is selected but checkpointNodeId is missing", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-create-3", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(
      {},
      {
        "image_gen.workflows": JSON.stringify({
          portrait_create: { mode: "create", promptNodeId: "6", workflowId: "portrait-workflow" },
        }),
      },
    );

    await expect(
      (await getImageGenProvider(env, "create")).generate(
        { mode: "create", prompt: "x", workflow_key: "portrait_create", ckpt_name: "myCustom.safetensors" },
        env,
      ),
    ).rejects.toMatchObject({ code: "provider_not_configured", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails create when the workflow is not configured", async () => {
    const env = createEnv({}, { "image_gen.workflows": "{}" });

    await expect(
      (await getImageGenProvider(env, "create")).generate(
        { mode: "create", prompt: "x", workflow_key: "portrait_create" },
        env,
      ),
    ).rejects.toMatchObject({ code: "provider_not_configured", retryable: false });
  });

  it("fails as non-retryable when required config is missing", async () => {
    const provider = await getImageGenProvider({ IMAGE_GEN_PROVIDER: "runninghub" } as Env, "variation");

    await expect(provider.generate(createRequest(), { IMAGE_GEN_PROVIDER: "runninghub" } as Env))
      .rejects.toMatchObject({
        code: "provider_not_configured",
        retryable: false,
      } satisfies Partial<ImageGenError>);
  });
});

describe("workflowHasCheckpointNode", () => {
  it("is true only when the workflow has a non-empty checkpointNodeId", () => {
    const raw = JSON.stringify({
      portrait_create: { mode: "create", promptNodeId: "6", workflowId: "portrait-workflow", checkpointNodeId: "4" },
      wfb: { mode: "create", promptNodeId: "6", workflowId: "alt-workflow" },
      wfc: { mode: "create", promptNodeId: "6", workflowId: "r", checkpointNodeId: "  " },
    });
    expect(workflowHasCheckpointNode(raw, "portrait_create")).toBe(true);
    expect(workflowHasCheckpointNode(raw, "wfb")).toBe(false);
    expect(workflowHasCheckpointNode(raw, "wfc")).toBe(false);
    expect(workflowHasCheckpointNode(raw, "missing")).toBe(false);
  });

  it("returns false for null or malformed JSON", () => {
    expect(workflowHasCheckpointNode(null, "portrait_create")).toBe(false);
    expect(workflowHasCheckpointNode("not json", "portrait_create")).toBe(false);
  });
});

describe("parseWorkflows", () => {
  it("parses URL workflows without architecture metadata", () => {
    expect(parseWorkflows(JSON.stringify({
      chat_moment: {
        instanceType: "plus",
        loadImageFieldName: "url",
        loadImageNodeId: "1",
        mode: "create",
        promptNodeId: "13",
        workflowId: "moment-url-workflow",
      },
    }))).toMatchObject({
      chat_moment: {
        instanceType: "plus",
        loadImageFieldName: "url",
        loadImageNodeId: "1",
        mode: "create",
        promptNodeId: "13",
        workflowId: "moment-url-workflow",
      },
    });
  });
});

function createEnv(
  envOverrides: Record<string, unknown> = {},
  settings: Record<string, string> = {},
): Env {
  const rows = new Map<string, string>([
    [
      "image_gen.workflows",
      JSON.stringify({
        portrait_variation: {
          mode: "variation",
          workflowId: "workflow-1",
          promptNodeId: "prompt-node",
          promptFieldName: "prompt",
          loadImageNodeId: "load-image-node",
        },
      }),
    ],
    ...Object.entries(settings),
  ]);

  return {
    DB: {
      prepare(sql: string) {
        return {
          all: async () => {
            if (sql.includes("FROM app_settings")) {
              return {
                results: [...rows.entries()].map(([key, value]) => ({ key, value })),
              };
            }
            return { results: [] };
          },
        };
      },
    },
    ASSETS: {
      get: async () => ({
        arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
        httpMetadata: { contentType: "image/webp" },
      }),
    },
    IMAGE_GEN_PROVIDER: "runninghub",
    IMAGE_GEN_PUBLIC_BASE_URL: "https://dev.aiappsbox.com/api",
    R2_SIGNING_KEY: "test-signing-key",
    RUNNINGHUB_API_KEY: "runninghub-api-key",
    RUNNINGHUB_BASE_URL: "https://www.runninghub.ai",
    RUNNINGHUB_WEBHOOK_SECRET: "webhook-secret",
    RUNNINGHUB_WEBHOOK_URL: "https://dev.aiappsbox.com/api/webhooks/runninghub",
    ...envOverrides,
  } as unknown as Env;
}

function createRequest(): ImageGenRequest {
  return {
    companion: {
      appearance: null,
      gender: "female",
      name: "Maya",
      personality: null,
      relationship_role: "friend",
    },
    emotion: "warm",
    prompt: "make a warm portrait",
    source_art_url: "companions/user/u1/neutral.webp",
  };
}
