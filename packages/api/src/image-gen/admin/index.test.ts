import { describe, expect, it, vi } from "vitest";

vi.mock("../../auth", () => ({
  requireAdminUser: async () => ({ email: "admin@example.com", id: "admin-1" }),
}));

import { handleAdminImageGenRequest } from "./index";

type Row = Record<string, unknown>;

function createEnv(rows: Row[]) {
  function execute(sql: string, values: unknown[]): unknown {
    if (sql.includes("FROM image_generation_jobs")) {
      const limit = values[values.length - 1] as number;
      let cursor = 0;
      let filtered = [...rows];
      if (sql.includes("status = ?")) {
        const status = values[cursor++] as string;
        filtered = filtered.filter((row) => row.status === status);
      }
      if (sql.includes("created_at >= ?")) {
        const from = values[cursor++] as number;
        filtered = filtered.filter((row) => Number(row.created_at) >= from);
      }
      if (sql.includes("created_at < ?")) {
        const to = values[cursor++] as number;
        filtered = filtered.filter((row) => Number(row.created_at) < to);
      }
      return {
        results: filtered
          .sort((a, b) => Number(b.created_at) - Number(a.created_at))
          .slice(0, limit)
          .map((row) => ({
            ...row,
            prompt_excerpt: String(row.prompt ?? "").slice(0, 240),
          })),
      };
    }
    throw new Error(`Unrecognized SQL in admin image-gen test: ${sql}`);
  }

  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          all: async () => execute(sql, values),
        }),
      }),
    },
  } as unknown as Env;

  return env;
}

describe("admin image generation jobs", () => {
  it("filters jobs by status and created_at range", async () => {
    const env = createEnv([
      job({ created_at: 1000, id: "old", status: "failed" }),
      job({ created_at: 2000, id: "match", prompt: "profile outfit prompt", status: "failed" }),
      job({ created_at: 2500, id: "processing", status: "processing" }),
      job({ created_at: 4000, id: "future", status: "failed" }),
    ]);

    const response = await handleAdminImageGenRequest(
      new Request("https://api.test/admin/image-gen-jobs?status=failed&created_from=1500&created_to=3000&limit=10"),
      env,
      "/admin/image-gen-jobs",
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { jobs: Array<{ id: string; prompt_excerpt: string }> };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toMatchObject({ id: "match", prompt_excerpt: "profile outfit prompt" });
  });
});

function job(overrides: Row): Row {
  return {
    completed_at: null,
    created_at: 0,
    error_code: null,
    error_message: null,
    id: "job",
    model: null,
    prompt: "",
    provider: null,
    provider_task_id: null,
    status: "failed",
    task: "profile_outfit_image",
    workflow_key: "profile_outfit",
    ...overrides,
  };
}
