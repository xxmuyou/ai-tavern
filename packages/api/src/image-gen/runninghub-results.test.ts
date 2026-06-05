import { afterEach, describe, expect, it, vi } from "vitest";

import { pollStaleRunningHubArtJobs } from "./runninghub-results";

type Row = Record<string, unknown>;

function createEnv(rows: Row[]) {
  const jobs = new Map(rows.map((row) => [row.id as string, row]));
  const queue: unknown[] = [];

  function execute(sql: string, values: unknown[], mode: "run" | "first" | "all"): unknown {
    if (sql.includes("status = 'processing'") && sql.includes("provider_task_id IS NOT NULL")) {
      const [beforeUpdatedAt, limit] = values as [number, number];
      const results = [...jobs.values()]
        .filter((row) => row.status === "processing" && row.provider_task_id && Number(row.updated_at) < beforeUpdatedAt)
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
    DB: {
      prepare: (sql: string) => ({
        ...buildStatement(sql),
        bind: (...values: unknown[]) => buildStatement(sql, values),
      }),
    },
    JOB_QUEUE: { send: async (msg: unknown) => void queue.push(msg) },
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
});
