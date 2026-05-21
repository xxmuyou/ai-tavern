import { describe, expect, it, vi } from "vitest";

import { maybeEnqueueSummary } from "./summary-queue";

function createEnv() {
  const send = vi.fn(async () => {});
  return {
    env: { JOB_QUEUE: { send } } as unknown as Env,
    send,
  };
}

describe("maybeEnqueueSummary", () => {
  it("does not enqueue when message_count <= 50", async () => {
    const { env, send } = createEnv();
    await maybeEnqueueSummary(env, "t-1", 50);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not enqueue on counts that don't hit the interval boundary", async () => {
    const { env, send } = createEnv();
    await maybeEnqueueSummary(env, "t-1", 51);
    await maybeEnqueueSummary(env, "t-1", 55);
    await maybeEnqueueSummary(env, "t-1", 69);
    expect(send).not.toHaveBeenCalled();
  });

  it("enqueues at 60, 70, 80 ...", async () => {
    const { env, send } = createEnv();
    await maybeEnqueueSummary(env, "t-1", 60);
    await maybeEnqueueSummary(env, "t-1", 70);
    await maybeEnqueueSummary(env, "t-1", 80);
    expect(send).toHaveBeenCalledTimes(3);
    const calls = send.mock.calls as unknown as Array<[
      { type: string; thread_id: string; message_count: number },
    ]>;
    const firstCall = calls[0]![0]!;
    expect(firstCall.type).toBe("chat.summary");
    expect(firstCall.thread_id).toBe("t-1");
    expect(firstCall.message_count).toBe(60);
  });
});
