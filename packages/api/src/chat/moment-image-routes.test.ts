import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuthUser: async () => ({ email: "user@example.com", id: "usr_1" }),
}));

// Credits are exercised in credits/ledger.test.ts; here we stub reserve/commit/
// release so the moment route's billing wrapper doesn't touch a real ledger DB.
vi.mock("../credits", () => ({
  reserveCredits: async () => ({ available_credits: 0, reservation_id: "res_1", reserved_credits: 0 }),
  commitReservation: async () => {},
  releaseReservation: async () => {},
  TASK_CREDIT_COST: { admin_prewarm: 0, chat_message: 1, image_generation: 40, signal_extract: 0, summary: 0, voice_generation: 3 },
  CreditsError: class CreditsError extends Error {},
}));

vi.mock("../image-gen/runninghub-results", () => ({
  pollRunningHubImageJobIfDue: vi.fn(async () => true),
}));

import { pollRunningHubImageJobIfDue } from "../image-gen/runninghub-results";
import { handleMomentImageRequest } from "./moment-routes";

const mockPollRunningHubImageJobIfDue = vi.mocked(pollRunningHubImageJobIfDue);

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
      const [id, user_id, task, mode_, workflow_key, prompt, output_prefix, billing_ref, created_at, updated_at] =
        values as [string, string, string, string, string, string, string, string | null, number, number];
      void billing_ref;
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
  afterEach(() => {
    mockPollRunningHubImageJobIfDue.mockClear();
    vi.useRealTimers();
  });

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
    expect(jobs[0]?.prompt).toContain("Change the background to: Private chat");
    // Sceneless moments are private: strict no-other-people wording, and the
    // LLM extractor (unavailable in this test env) falls back to a profile-ordered
    // home_private/reserved styling candidate instead of a vague default.
    expect(jobs[0]?.prompt).toContain("The background is empty of other people");
    expect(jobs[0]?.prompt).toContain(
      "Change the reference pose to: standing three-quarter pose, face toward viewer",
    );
    expect(jobs[0]?.prompt).toContain("Camera view: low-angle sofa-side view from below eye level");
    expect(jobs[0]?.prompt).toContain(
      "Outfit (overrides any clothing mentioned in the reference): soft fitted lounge dress with a defined waist",
    );
    expect(jobs[0]?.prompt).not.toContain("Style profile:");
    expect(jobs[0]?.prompt).not.toContain("Pose/body quality:");
    expect(jobs[0]?.prompt).toContain("Change the hairstyle to: casual messy bun");
    expect(jobs[0]?.prompt).not.toContain("an outfit that naturally fits the scene");
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

  it("returns queued label for provider capacity waits", async () => {
    const { env, jobs, moments } = createEnv();
    const now = Date.now();
    jobs.push({
      completed_at: null,
      created_at: now,
      error_code: "provider_queue_wait",
      error_message: "Queued",
      id: "job_queued",
      output_key: null,
      provider_task_id: null,
      status: "processing",
      updated_at: now,
    });
    moments.push({
      companion_id: "maya",
      id: "moment_queued",
      job_id: "job_queued",
      message_id: "msg_private",
      output_key: null,
      status: "processing",
      updated_at: now,
      user_id: "usr_1",
    });

    const response = await handleMomentImageRequest(
      new Request("https://api.test/moment-images/jobs/job_queued"),
      env,
      "/moment-images/jobs/job_queued",
    );

    expect(response?.status).toBe(200);
    expect(await response!.json()).toMatchObject({
      error_code: "provider_queue_wait",
      error_message: "Queued",
      queue_reason: "provider_capacity",
      status: "processing",
      status_label: "Queued",
    });
  });

  it("does not poll RunningHub for a fresh pending moment job", async () => {
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const { env, jobs, moments } = createEnv();
    const now = Date.now();
    jobs.push({
      completed_at: null,
      created_at: now - 30_000,
      error_code: null,
      error_message: null,
      id: "job_fresh",
      output_key: null,
      provider_task_id: "rh-fresh",
      status: "processing",
      updated_at: now - 30_000,
    });
    moments.push({
      companion_id: "maya",
      id: "moment_fresh",
      job_id: "job_fresh",
      message_id: "msg_private",
      output_key: null,
      status: "processing",
      updated_at: now - 30_000,
      user_id: "usr_1",
    });

    const response = await handleMomentImageRequest(
      new Request("https://api.test/moment-images/jobs/job_fresh"),
      env,
      "/moment-images/jobs/job_fresh",
    );

    expect(response?.status).toBe(200);
    expect(mockPollRunningHubImageJobIfDue).not.toHaveBeenCalled();
  });

  it("polls RunningHub once a pending moment job is older than one minute", async () => {
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const { env, jobs, moments } = createEnv();
    const now = Date.now();
    jobs.push({
      completed_at: null,
      created_at: now - 61_000,
      error_code: null,
      error_message: null,
      id: "job_stale",
      output_key: null,
      provider_task_id: "rh-stale",
      status: "processing",
      updated_at: now - 61_000,
    });
    moments.push({
      companion_id: "maya",
      id: "moment_stale",
      job_id: "job_stale",
      message_id: "msg_private",
      output_key: null,
      status: "processing",
      updated_at: now - 61_000,
      user_id: "usr_1",
    });

    const response = await handleMomentImageRequest(
      new Request("https://api.test/moment-images/jobs/job_stale"),
      env,
      "/moment-images/jobs/job_stale",
    );

    expect(response?.status).toBe(200);
    expect(mockPollRunningHubImageJobIfDue).toHaveBeenCalledTimes(1);
    expect(mockPollRunningHubImageJobIfDue).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: "job_stale", provider_task_id: "rh-stale" }),
      { staleAfterMs: 60_000 },
    );
  });
});
