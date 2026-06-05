import { describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuthUser: async () => ({ email: "user@example.com", id: "usr_1" }),
}));

import { handleMomentImageRequest } from "./moment-routes";

type Row = Record<string, unknown>;

function createEnv(): { env: Env; jobs: Row[]; moments: Row[]; queue: unknown[] } {
  const jobs: Row[] = [];
  const moments: Row[] = [];
  const queue: unknown[] = [];

  function execute(sql: string, values: unknown[], mode: "run" | "first" | "all"): unknown {
    if (sql.includes("FROM app_settings")) {
      return mode === "all" ? { results: [] } : null;
    }

    if (sql.includes("FROM messages WHERE id = ?")) {
      return {
        activity_id: null,
        content: "<narration>Maya smiles across the desk.</narration> I like this little corner.",
        created_at: 1_700_000_000,
        emotion: "warm",
        id: values[0],
        role: "companion",
        scene_id: null,
        thread_id: "thr_1",
      };
    }

    if (sql.includes("FROM threads WHERE id = ?")) {
      return { companion_id: "maya", id: "thr_1", user_id: "usr_1" };
    }

    if (sql.includes("FROM story_moment_images WHERE user_id = ? AND message_id = ?")) {
      return null;
    }

    if (sql.includes("FROM story_moment_images WHERE job_id = ?")) {
      return moments.find((row) => row.job_id === values[0]) ?? null;
    }

    if (sql.includes("FROM image_generation_jobs WHERE id = ?")) {
      return jobs.find((row) => row.id === values[0]) ?? null;
    }

    if (sql.includes("FROM companions")) {
      return {
        appearance: "long dark hair, soft cardigan",
        background: "quiet artist",
        boundary: null,
        created_by: null,
        gender: "female",
        id: "maya",
        is_active: 1,
        name: "Maya",
        personality: "warm and observant",
        relationship_role: "companion",
        secret: null,
        source: "official",
        speech_style: null,
        want: null,
      };
    }

    if (sql.includes("FROM relationships")) {
      return null;
    }

    if (sql.includes("FROM messages") && sql.includes("role = 'user'")) {
      return { content: "Let's stay here a while." };
    }

    if (sql.includes("FROM users WHERE id = ?")) {
      return { timezone: "UTC" };
    }

    if (sql.startsWith("INSERT INTO image_generation_jobs")) {
      const [id, user_id, task, mode_, workflow_key, prompt, output_prefix, created_at, updated_at] =
        values as [string, string, string, string, string, string, string, number, number];
      jobs.push({
        created_at,
        error_code: null,
        error_message: null,
        id,
        mode: mode_,
        output_key: null,
        output_prefix,
        provider_task_id: null,
        prompt,
        status: "pending",
        task,
        updated_at,
        user_id,
        workflow_key,
      });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT INTO story_moment_images")) {
      const [
        id,
        user_id,
        companion_id,
        thread_id,
        message_id,
        scene_id,
        activity_id,
        story_beat_id,
        emotion,
        prompt_snapshot,
        job_id,
        created_at,
        updated_at,
      ] = values as [
        string,
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        string | null,
        string,
        string,
        number,
        number,
      ];
      moments.push({
        activity_id,
        companion_id,
        created_at,
        emotion,
        id,
        job_id,
        message_id,
        output_key: null,
        prompt_snapshot,
        scene_id,
        status: "queued",
        story_beat_id,
        thread_id,
        updated_at,
        user_id,
      });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE story_moment_images SET")) {
      const setClause = sql.slice(sql.indexOf("SET ") + 4, sql.indexOf(" WHERE id = ?"));
      const cols = setClause.split(", ").map((part) => part.split(" = ")[0]!.trim());
      const id = values[values.length - 1] as string;
      const row = moments.find((item) => item.id === id);
      if (row) {
        cols.forEach((col, index) => {
          row[col] = values[index];
        });
      }
      return { meta: { changes: 1 } };
    }

    if (mode === "all") return { results: [] };
    throw new Error(`Unrecognized SQL in moment route test: ${sql}`);
  }

  const buildStatement = (sql: string, values: unknown[] = []) => ({
    all: async () => execute(sql, values, "all"),
    first: async () => execute(sql, values, "first"),
    run: async () => execute(sql, values, "run"),
  });

  const env = {
    DB: {
      prepare: (sql: string) => ({
        ...buildStatement(sql),
        bind: (...values: unknown[]) => buildStatement(sql, values),
      }),
    },
    JOB_QUEUE: { send: async (msg: unknown) => void queue.push(msg) },
  } as unknown as Env;

  return { env, jobs, moments, queue };
}

describe("moment image routes", () => {
  it("allows direct chat companion messages without scene context", async () => {
    const { env, jobs, moments, queue } = createEnv();
    const request = new Request("https://api.test/chat/messages/msg_private/moment-image/generate", {
      method: "POST",
    });

    const response = await handleMomentImageRequest(
      request,
      env,
      "/chat/messages/msg_private/moment-image/generate",
    );

    expect(response?.status).toBe(202);
    const body = (await response?.json()) as { status: string };
    expect(body.status).toBe("queued");
    expect(jobs[0]).toMatchObject({
      mode: "text_to_image",
      output_prefix: "chat-moments",
      task: "chat_moment_image",
      workflow_key: "chat_moment",
    });
    expect(jobs[0]?.prompt).toContain("Scene: Private chat");
    expect(moments[0]).toMatchObject({
      message_id: "msg_private",
      scene_id: null,
    });
    expect(queue).toEqual([expect.objectContaining({ type: "image.generate" })]);
  });

  it("syncs a failed generic image job onto the moment status response", async () => {
    const { env, jobs, moments } = createEnv();
    jobs.push({
      completed_at: Date.now(),
      created_at: Date.now(),
      error_code: "stuck_pending",
      error_message: "Job was never picked up by the queue consumer",
      id: "job_failed",
      output_key: null,
      provider_task_id: null,
      status: "failed",
      updated_at: Date.now(),
    });
    moments.push({
      companion_id: "maya",
      id: "moment_failed",
      job_id: "job_failed",
      message_id: "msg_private",
      output_key: null,
      status: "queued",
      updated_at: Date.now(),
      user_id: "usr_1",
    });

    const response = await handleMomentImageRequest(
      new Request("https://api.test/moment-images/jobs/job_failed"),
      env,
      "/moment-images/jobs/job_failed",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { error_code?: string; error_message?: string; status: string };
    expect(body).toMatchObject({
      error_code: "stuck_pending",
      error_message: "Job was never picked up by the queue consumer",
      status: "failed",
    });
    expect(moments[0]).toMatchObject({ status: "failed", output_key: null });
  });
});
