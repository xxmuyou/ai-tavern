import { afterEach, describe, expect, it, vi } from "vitest";

import { getImageGenProvider, styleHasCheckpointNode } from ".";
import { ImageGenError, type ImageGenRequest } from "./types";

describe("runningHubImageGenProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a RunningHub task with signed source URL and webhook secret", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 0,
          msg: "success",
          data: { taskId: "rh-task-1", taskStatus: "QUEUED" },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = await getImageGenProvider(createEnv());
    const result = await provider.generate(createRequest(), createEnv());

    expect(result).toEqual({
      external_task_id: "rh-task-1",
      model: "companion-expression-pack-v1",
      provider: "runninghub",
      type: "pending",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.runninghub.ai/task/openapi/create",
      expect.objectContaining({ method: "POST" }),
    );
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const [, init] = calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.workflowId).toBe("workflow-1");
    expect(body.webhookUrl).toBe(
      "https://dev.aiappsbox.com/api/webhooks/runninghub?secret=webhook-secret",
    );
    expect(body.nodeInfoList).toEqual([
      expect.objectContaining({
        fieldName: "url",
        nodeId: "load-image-node",
      }),
      {
        fieldName: "text",
        fieldValue: "make a warm portrait",
        nodeId: "prompt-node",
      },
    ]);
    expect(body.nodeInfoList[0].fieldValue).toMatch(
      /^https:\/\/dev\.aiappsbox\.com\/api\/objects\/signed\/companions%2Fuser%2Fu1%2Fneutral\.webp\?exp=\d+&sig=[a-f0-9]{64}$/,
    );
  });

  it("creates a WF-1 create task overriding only the prompt node", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-create-1", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      IMAGE_GEN_PROVIDER: "runninghub",
      RUNNINGHUB_API_KEY: "runninghub-api-key",
      RUNNINGHUB_BASE_URL: "https://www.runninghub.ai",
      RUNNINGHUB_CREATE_WORKFLOWS: JSON.stringify({
        anime_kr: { promptNodeId: "6", workflowId: "kr-workflow" },
      }),
      RUNNINGHUB_WEBHOOK_URL: "https://dev.aiappsbox.com/api/webhooks/runninghub",
    } as unknown as Env;

    const result = await (await getImageGenProvider(env)).generate(
      { mode: "create", prompt: "a calm girl in a sweater", style: "anime_kr" },
      env,
    );

    expect(result).toEqual({
      external_task_id: "rh-create-1",
      model: "companion-create-anime_kr",
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

  it("overrides the checkpoint node when checkpointNodeId is configured", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: 0, data: { taskId: "rh-create-2", taskStatus: "QUEUED" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      IMAGE_GEN_PROVIDER: "runninghub",
      RUNNINGHUB_API_KEY: "runninghub-api-key",
      RUNNINGHUB_CREATE_WORKFLOWS: JSON.stringify({
        anime_kr: { promptNodeId: "6", workflowId: "kr-workflow", checkpointNodeId: "4" },
      }),
      RUNNINGHUB_WEBHOOK_URL: "https://dev.aiappsbox.com/api/webhooks/runninghub",
    } as unknown as Env;

    await (await getImageGenProvider(env)).generate(
      { mode: "create", prompt: "x", style: "anime_kr", ckpt_name: "myCustom.safetensors" },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.nodeInfoList).toEqual([
      { fieldName: "text", fieldValue: "x", nodeId: "6" },
      { fieldName: "ckpt_name", fieldValue: "myCustom.safetensors", nodeId: "4" },
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

    const env = {
      IMAGE_GEN_PROVIDER: "runninghub",
      RUNNINGHUB_API_KEY: "runninghub-api-key",
      RUNNINGHUB_CREATE_WORKFLOWS: JSON.stringify({
        anime_kr: { promptNodeId: "6", workflowId: "kr-workflow" },
      }),
      RUNNINGHUB_WEBHOOK_URL: "https://dev.aiappsbox.com/api/webhooks/runninghub",
    } as unknown as Env;

    await (await getImageGenProvider(env)).generate(
      { mode: "create", prompt: "x", style: "anime_kr", ckpt_name: "myCustom.safetensors" },
      env,
    );

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]![1].body));
    expect(body.nodeInfoList).toEqual([{ fieldName: "text", fieldValue: "x", nodeId: "6" }]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("fails create when the style has no configured workflow", async () => {
    const env = {
      IMAGE_GEN_PROVIDER: "runninghub",
      RUNNINGHUB_API_KEY: "runninghub-api-key",
      RUNNINGHUB_CREATE_WORKFLOWS: "{}",
    } as unknown as Env;

    await expect(
      (await getImageGenProvider(env)).generate(
        { mode: "create", prompt: "x", style: "anime_kr" },
        env,
      ),
    ).rejects.toMatchObject({ code: "provider_not_configured", retryable: false });
  });

  it("fails as non-retryable when required config is missing", async () => {
    const provider = await getImageGenProvider({ IMAGE_GEN_PROVIDER: "runninghub" } as Env);

    await expect(provider.generate(createRequest(), { IMAGE_GEN_PROVIDER: "runninghub" } as Env))
      .rejects.toMatchObject({
        code: "provider_not_configured",
        retryable: false,
      } satisfies Partial<ImageGenError>);
  });
});

describe("styleHasCheckpointNode", () => {
  it("is true only when the style has a non-empty checkpointNodeId", () => {
    const raw = JSON.stringify({
      anime_kr: { promptNodeId: "6", workflowId: "kr", checkpointNodeId: "4" },
      anime_jp: { promptNodeId: "6", workflowId: "jp" },
      realistic: { promptNodeId: "6", workflowId: "r", checkpointNodeId: "  " },
    });
    expect(styleHasCheckpointNode(raw, "anime_kr")).toBe(true);
    expect(styleHasCheckpointNode(raw, "anime_jp")).toBe(false);
    expect(styleHasCheckpointNode(raw, "realistic")).toBe(false);
    expect(styleHasCheckpointNode(raw, "missing")).toBe(false);
  });

  it("returns false for null or malformed JSON", () => {
    expect(styleHasCheckpointNode(null, "anime_kr")).toBe(false);
    expect(styleHasCheckpointNode("not json", "anime_kr")).toBe(false);
  });
});

function createEnv(): Env {
  return {
    IMAGE_GEN_PROVIDER: "runninghub",
    IMAGE_GEN_PUBLIC_BASE_URL: "https://dev.aiappsbox.com/api",
    R2_SIGNING_KEY: "test-signing-key",
    RUNNINGHUB_API_KEY: "runninghub-api-key",
    RUNNINGHUB_BASE_URL: "https://www.runninghub.ai",
    RUNNINGHUB_LOAD_IMAGE_NODE_ID: "load-image-node",
    RUNNINGHUB_PROMPT_NODE_ID: "prompt-node",
    RUNNINGHUB_WEBHOOK_SECRET: "webhook-secret",
    RUNNINGHUB_WEBHOOK_URL: "https://dev.aiappsbox.com/api/webhooks/runninghub",
    RUNNINGHUB_WORKFLOW_ID: "workflow-1",
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
