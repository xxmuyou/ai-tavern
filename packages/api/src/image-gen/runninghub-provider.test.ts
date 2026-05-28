import { afterEach, describe, expect, it, vi } from "vitest";

import { getImageGenProvider } from ".";
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

    const provider = getImageGenProvider(createEnv());
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

  it("fails as non-retryable when required config is missing", async () => {
    const provider = getImageGenProvider({ IMAGE_GEN_PROVIDER: "runninghub" } as Env);

    await expect(provider.generate(createRequest(), { IMAGE_GEN_PROVIDER: "runninghub" } as Env))
      .rejects.toMatchObject({
        code: "provider_not_configured",
        retryable: false,
      } satisfies Partial<ImageGenError>);
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
