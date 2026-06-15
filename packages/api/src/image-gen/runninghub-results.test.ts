import { afterEach, describe, expect, it, vi } from "vitest";

import { pollRunningHubImageJobIfDue, pollStaleRunningHubArtJobs } from "./runninghub-results";
import type { ImageGenJobRow } from "./base-art";

type Row = Record<string, unknown>;

function createEnv(rows: Row[]) {
  const jobs = new Map(rows.map((row) => [row.id as string, row]));
  const queue: unknown[] = [];

  function execute(sql: string, values: unknown[], mode: "run" | "first" | "all"): unknown {
    if (sql.includes("status = 'processing'") && sql.includes("provider_task_id IS NOT NULL")) {
      const [beforeUpdatedAt, hardTimeoutBeforeUpdatedAt, beforeProviderPollAt, limit] =
        values as [number, number, number, number];
      const results = [...jobs.values()]
        .filter((row) => {
          if (row.status !== "processing" || !row.provider_task_id || Number(row.updated_at) >= beforeUpdatedAt) {
            return false;
          }
          const lastPolledAt = row.provider_last_polled_at == null ? null : Number(row.provider_last_polled_at);
          return (
            Number(row.updated_at) < hardTimeoutBeforeUpdatedAt ||
            lastPolledAt === null ||
            lastPolledAt < beforeProviderPollAt
          );
        })
        .slice(0, limit);
      return { results };
    }

    if (sql.includes("status IN ('pending', 'processing')") && sql.includes("provider_task_id IS NULL")) {
      const [beforeUpdatedAt, limit] = values as [number, number];
      const results = [...jobs.values()]
        .filter((row) =>
          (row.status === "pending" || row.status === "processing") &&
          row.provider_task_id == null &&
          Number(row.updated_at) < beforeUpdatedAt
        )
        .slice(0, limit);
      return { results };
    }

    if (sql.startsWith("UPDATE image_generation_jobs SET")) {
      updateRow(sql, values, jobs);
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT OR REPLACE INTO asset_objects")) {
      return { meta: { changes: 1 } };
    }

    if (sql.includes("FROM app_settings")) {
      return mode === "all" ? { results: [] } : null;
    }

    if (mode === "all") return { results: [] };
    throw new Error(`Unrecognized SQL in runninghub results test: ${sql}`);
  }

  const buildStatement = (sql: string, values: unknown[] = []) => ({
    all: async () => execute(sql, values, "all"),
    first: async () => execute(sql, values, "first"),
    run: async () => execute(sql, values, "run"),
  });

  const env = {
    ASSETS: {
      put: async () => {},
    },
    DB: {
      prepare: (sql: string) => ({
        ...buildStatement(sql),
        bind: (...values: unknown[]) => buildStatement(sql, values),
      }),
    },
    JOB_QUEUE: { send: async (msg: unknown) => void queue.push(msg) },
    RUNNINGHUB_API_KEY: "rh-test-key",
  } as unknown as Env;

  return { env, jobs, queue };
}

function imageJob(overrides: Partial<Row>): Row {
  const now = Date.now();
  return {
    completed_at: null,
    created_at: now,
    error_code: null,
    error_message: null,
    id: "job-1",
    output_key: null,
    provider_last_polled_at: null,
    provider_task_id: null,
    status: "processing",
    updated_at: now,
    ...overrides,
  };
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

describe("RunningHub stale image job recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("re-enqueues stale processing jobs that never received a provider task id", async () => {
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const now = Date.now();
    const { env, jobs, queue } = createEnv([
      imageJob({ id: "job-processing", updated_at: now - 3 * 60 * 1000 }),
    ]);

    await pollStaleRunningHubArtJobs(env);

    expect(queue).toEqual([expect.objectContaining({ job_id: "job-processing", type: "image.generate" })]);
    expect(jobs.get("job-processing")?.status).toBe("processing");
  });

  it("fails unclaimed processing jobs after the hard timeout", async () => {
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const now = Date.now();
    const { env, jobs, queue } = createEnv([
      imageJob({ id: "job-timeout", updated_at: now - 16 * 60 * 1000 }),
    ]);

    await pollStaleRunningHubArtJobs(env);

    expect(queue).toEqual([]);
    expect(jobs.get("job-timeout")).toMatchObject({
      error_code: "stuck_pending",
      error_message: "Job was never picked up by the queue consumer",
      status: "failed",
    });
  });

  it("stores RunningHub provider timing and coin metrics when a stale task succeeds", async () => {
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const now = Date.now();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/task/openapi/outputs")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: [
              {
                consumeCoins: "1.25",
                fileType: "png",
                fileUrl: "https://cdn.example/moment.png",
                taskCostTime: "62.4",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response("image", { headers: { "content-type": "image/png" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { env, jobs } = createEnv([
      imageJob({
        id: "job-provider",
        output_prefix: "chat-moments",
        provider: "runninghub",
        provider_task_id: "rh-task-1",
        updated_at: now - 3 * 60 * 1000,
        user_id: "usr_1",
      }),
    ]);

    await pollStaleRunningHubArtJobs(env);

    expect(jobs.get("job-provider")).toMatchObject({
      provider_consume_coins: 1.25,
      provider_last_polled_at: now,
      provider_result_received_at: now,
      provider_task_cost_time_ms: 62_400,
      status: "succeeded",
    });
  });

  it("records a pending provider poll without touching updated_at", async () => {
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const now = Date.now();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ code: 0, data: { taskStatus: "RUNNING" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const originalUpdatedAt = now - 61_000;
    const { env, jobs } = createEnv([
      imageJob({
        id: "job-pending",
        provider_task_id: "rh-pending",
        updated_at: originalUpdatedAt,
      }),
    ]);

    const polled = await pollRunningHubImageJobIfDue(env, jobs.get("job-pending") as ImageGenJobRow, {
      now,
      staleAfterMs: 60_000,
    });

    expect(polled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs.get("job-pending")).toMatchObject({
      provider_last_polled_at: now,
      status: "processing",
      updated_at: originalUpdatedAt,
    });
  });

  it("treats APIKEY_TASK_IS_RUNNING as pending instead of failing the job", async () => {
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const now = Date.now();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 1, msg: "APIKEY_TASK_IS_RUNNING" }), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: { taskStatus: "RUNNING" } }), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const originalUpdatedAt = now - 61_000;
    const { env, jobs } = createEnv([
      imageJob({
        id: "job-provider-running",
        provider_task_id: "rh-running",
        updated_at: originalUpdatedAt,
      }),
    ]);

    const polled = await pollRunningHubImageJobIfDue(env, jobs.get("job-provider-running") as ImageGenJobRow, {
      now,
      staleAfterMs: 60_000,
    });

    expect(polled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs.get("job-provider-running")).toMatchObject({
      error_code: null,
      provider_last_polled_at: now,
      status: "processing",
      updated_at: originalUpdatedAt,
    });
  });

  it("does not repeat provider polls inside the throttle window", async () => {
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const now = Date.now();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ code: 0, data: { taskStatus: "RUNNING" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { env, jobs } = createEnv([
      imageJob({
        id: "job-recently-polled",
        provider_last_polled_at: now - 2_500,
        provider_task_id: "rh-recent",
        updated_at: now - 61_000,
      }),
    ]);

    const polled = await pollRunningHubImageJobIfDue(env, jobs.get("job-recently-polled") as ImageGenJobRow, {
      now,
      staleAfterMs: 60_000,
    });

    expect(polled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows another provider poll after the throttle window", async () => {
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const now = Date.now();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ code: 0, data: { taskStatus: "RUNNING" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { env, jobs } = createEnv([
      imageJob({
        id: "job-old-poll",
        provider_last_polled_at: now - 61_000,
        provider_task_id: "rh-old",
        updated_at: now - 2 * 60_000,
      }),
    ]);

    const polled = await pollRunningHubImageJobIfDue(env, jobs.get("job-old-poll") as ImageGenJobRow, {
      now,
      staleAfterMs: 60_000,
    });

    expect(polled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs.get("job-old-poll")?.provider_last_polled_at).toBe(now);
  });

  it("still applies the hard timeout even when the provider was polled recently", async () => {
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const now = Date.now();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { env, jobs } = createEnv([
      imageJob({
        id: "job-hard-timeout",
        provider_last_polled_at: now - 2_500,
        provider_task_id: "rh-timeout",
        updated_at: now - 16 * 60_000,
      }),
    ]);

    const polled = await pollRunningHubImageJobIfDue(env, jobs.get("job-hard-timeout") as ImageGenJobRow, {
      now,
      staleAfterMs: 60_000,
    });

    expect(polled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(jobs.get("job-hard-timeout")).toMatchObject({
      error_code: "timeout",
      status: "failed",
    });
  });

  it("cron skips provider jobs inside the provider poll throttle window", async () => {
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const now = Date.now();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { env } = createEnv([
      imageJob({
        id: "job-cron-skip",
        provider_last_polled_at: now - 30_000,
        provider_task_id: "rh-cron-skip",
        updated_at: now - 3 * 60_000,
      }),
    ]);

    await pollStaleRunningHubArtJobs(env);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
