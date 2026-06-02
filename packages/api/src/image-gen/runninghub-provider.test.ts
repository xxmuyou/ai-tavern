import { afterEach, describe, expect, it, vi } from "vitest";

import { getImageGenProvider, workflowHasCheckpointNode } from ".";
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

  it("creates a WF-1 create task overriding only the prompt node", async () => {
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
          wf1: { mode: "create", promptNodeId: "6", workflowId: "kr-workflow" },
        }),
      },
    );

    const result = await (await getImageGenProvider(env, "create")).generate(
      { mode: "create", prompt: "a calm girl in a sweater", workflow_key: "wf1" },
      env,
    );

    expect(result).toEqual({
      external_task_id: "rh-create-1",
      model: "companion-create-wf1",
      provider: "runninghub",
      type: "pending",
    });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.workflowId).toBe("kr-workflow");
    expect(body.nodeInfoList).toEqual([
      { fieldName: "text", fieldValue: "a calm girl in a sweater", nodeId: "6" },
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
          wf1: {
            mode: "create",
            promptNodeId: "6",
            workflowId: "kr-workflow",
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
        workflow_key: "wf1",
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
          wf1: {
            mode: "create",
            promptNodeId: "6",
            workflowId: "kr-workflow",
            checkpointNodeId: "4",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "create")).generate(
      { mode: "create", prompt: "x", workflow_key: "wf1" },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.nodeInfoList).toEqual([{ fieldName: "text", fieldValue: "x", nodeId: "6" }]);
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
          wf1: {
            mode: "create",
            promptNodeId: "6",
            workflowId: "kr-workflow",
            checkpointNodeId: "4",
          },
        }),
      },
    );

    await (await getImageGenProvider(env, "create")).generate(
      { mode: "create", prompt: "x", workflow_key: "wf1", ckpt_name: "model.safetensors" },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.nodeInfoList).toEqual([
      { fieldName: "text", fieldValue: "x", nodeId: "6" },
      { fieldName: "ckpt_name", fieldValue: "model.safetensors", nodeId: "4" },
    ]);
  });

  it("ignores ckpt_name without throwing when checkpointNodeId is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
          wf1: { mode: "create", promptNodeId: "6", workflowId: "kr-workflow" },
        }),
      },
    );

    await (await getImageGenProvider(env, "create")).generate(
      { mode: "create", prompt: "x", workflow_key: "wf1", ckpt_name: "myCustom.safetensors" },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.nodeInfoList).toEqual([{ fieldName: "text", fieldValue: "x", nodeId: "6" }]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("fails create when the workflow is not configured", async () => {
    const env = createEnv({}, { "image_gen.workflows": "{}" });

    await expect(
      (await getImageGenProvider(env, "create")).generate(
        { mode: "create", prompt: "x", workflow_key: "wf1" },
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
      wf1: { mode: "create", promptNodeId: "6", workflowId: "kr", checkpointNodeId: "4" },
      wfb: { mode: "create", promptNodeId: "6", workflowId: "jp" },
      wfc: { mode: "create", promptNodeId: "6", workflowId: "r", checkpointNodeId: "  " },
    });
    expect(workflowHasCheckpointNode(raw, "wf1")).toBe(true);
    expect(workflowHasCheckpointNode(raw, "wfb")).toBe(false);
    expect(workflowHasCheckpointNode(raw, "wfc")).toBe(false);
    expect(workflowHasCheckpointNode(raw, "missing")).toBe(false);
  });

  it("returns false for null or malformed JSON", () => {
    expect(workflowHasCheckpointNode(null, "wf1")).toBe(false);
    expect(workflowHasCheckpointNode("not json", "wf1")).toBe(false);
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
        wf2: {
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
