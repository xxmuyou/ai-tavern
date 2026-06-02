import { describe, expect, it } from "vitest";

import {
  createSessionsStore,
  createUsersStore,
  issueTestSessionToken,
  type SessionsStore,
  type UsersStore,
} from "../auth/test-fixtures";
import { handleCompanionEmotionArtRequest } from "./emotion-art-routes";

type CompanionRow = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
  name: string;
  appearance: string | null;
  personality: string | null;
  relationship_role: string | null;
  gender: string | null;
  art_url: string | null;
  art_emotions: string | null;
};

type JobRow = {
  id: string;
  companion_id: string;
  user_id: string | null;
  emotion: string;
  status: string;
  source_art_url: string;
  output_key: string | null;
  external_task_id: string | null;
  provider: string | null;
  model: string | null;
  prompt: string;
  error_code: string | null;
  error_message: string | null;
  credit_txn_id: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
};

describe("companion emotion-art routes", () => {
  it("lets a Pro user queue emotion art for their own custom companion", async () => {
    const env = createEnv({
      companions: [userCompanion("echo", "user-1")],
      proUserIds: ["user-1"],
    });
    const token = await issueToken(env, "player@example.com");

    const response = await handleCompanionEmotionArtRequest(
      authedRequest("http://api/companions/echo/emotion-art/warm/generate", token, "POST"),
      env,
      "/companions/echo/emotion-art/warm/generate",
    );

    expect(response?.status).toBe(202);
    const body = (await response!.json()) as { job_id: string; status: string };
    expect(body.status).toBe("queued");
    expect(env.jobs).toHaveLength(1);
    expect(env.jobs[0]).toMatchObject({
      companion_id: "echo",
      emotion: "warm",
      source_art_url: "companions/user/user-1/neutral.webp",
      status: "pending",
      user_id: "user-1",
    });
    expect(env.queue).toEqual([
      expect.objectContaining({
        companion_id: "echo",
        emotion: "warm",
        job_id: body.job_id,
        type: "companion.emotion_art.generate",
      }),
    ]);
  });

  it("returns cached for an already-unlocked emotion (no force)", async () => {
    const env = createEnv({
      companions: [
        {
          ...userCompanion("echo", "user-1"),
          art_emotions: JSON.stringify({
            neutral: "companions/user/user-1/neutral.webp",
            warm: "companions/user/user-1/warm.webp",
          }),
        },
      ],
      proUserIds: ["user-1"],
    });
    const token = await issueToken(env, "player@example.com");

    const response = await handleCompanionEmotionArtRequest(
      authedRequest("http://api/companions/echo/emotion-art/warm/generate", token, "POST"),
      env,
      "/companions/echo/emotion-art/warm/generate",
    );

    expect(response?.status).toBe(200);
    const body = (await response!.json()) as { status: string; key: string };
    expect(body.status).toBe("cached");
    expect(body.key).toBe("companions/user/user-1/warm.webp");
    expect(env.jobs).toHaveLength(0);
    expect(env.queue).toHaveLength(0);
  });

  it("force=1 regenerates an already-unlocked emotion (skips cache, enqueues)", async () => {
    const env = createEnv({
      companions: [
        {
          ...userCompanion("echo", "user-1"),
          art_emotions: JSON.stringify({
            neutral: "companions/user/user-1/neutral.webp",
            warm: "companions/user/user-1/warm.webp",
          }),
        },
      ],
      proUserIds: ["user-1"],
    });
    const token = await issueToken(env, "player@example.com");

    const response = await handleCompanionEmotionArtRequest(
      authedRequest("http://api/companions/echo/emotion-art/warm/generate?force=1", token, "POST"),
      env,
      "/companions/echo/emotion-art/warm/generate",
    );

    expect(response?.status).toBe(202);
    const body = (await response!.json()) as { status: string };
    expect(body.status).toBe("queued");
    expect(env.jobs).toHaveLength(1);
    expect(env.queue).toHaveLength(1);
  });

  it("blocks a free (non-Pro) user from queueing emotion art", async () => {
    const env = createEnv({
      companions: [userCompanion("echo", "user-1")],
    });
    const token = await issueToken(env, "player@example.com");

    const response = await handleCompanionEmotionArtRequest(
      authedRequest("http://api/companions/echo/emotion-art/warm/generate", token, "POST"),
      env,
      "/companions/echo/emotion-art/warm/generate",
    );

    expect(response?.status).toBe(402);
    const body = (await response!.json()) as { error: string };
    expect(body.error).toBe("subscription_required");
    expect(env.jobs).toHaveLength(0);
    expect(env.queue).toHaveLength(0);
  });

  it("does not let a user queue emotion art for another user's companion", async () => {
    const env = createEnv({
      companions: [userCompanion("private", "user-2")],
      users: [
        { email: "player@example.com", id: "user-1" },
        { email: "other@example.com", id: "user-2" },
      ],
    });
    const token = await issueToken(env, "player@example.com");

    const response = await handleCompanionEmotionArtRequest(
      authedRequest("http://api/companions/private/emotion-art/warm/generate", token, "POST"),
      env,
      "/companions/private/emotion-art/warm/generate",
    );

    expect(response?.status).toBe(403);
    expect(env.jobs).toHaveLength(0);
    expect(env.queue).toHaveLength(0);
  });

  it("keeps official companion emotion generation admin-only", async () => {
    const env = createEnv({
      companions: [officialCompanion("maya")],
    });
    const token = await issueToken(env, "player@example.com");

    const response = await handleCompanionEmotionArtRequest(
      authedRequest("http://api/companions/maya/emotion-art/warm/generate", token, "POST"),
      env,
      "/companions/maya/emotion-art/warm/generate",
    );

    expect(response?.status).toBe(403);
    expect(env.jobs).toHaveLength(0);
    expect(env.queue).toHaveLength(0);
  });
});

type TestEnv = Env & {
  jobs: JobRow[];
  queue: unknown[];
  sessionsStore: SessionsStore;
  usersStore: UsersStore;
};

function createEnv(fixtures: {
  companions: CompanionRow[];
  users?: Array<{ id: string; email: string }>;
  proUserIds?: string[];
}): TestEnv {
  const proUserIds = new Set(fixtures.proUserIds ?? []);
  const seed = fixtures.users ?? [{ email: "player@example.com", id: "user-1" }];
  const usersStore = createUsersStore(
    seed.map((user) => ({
      created_at: 1,
      display_name: null,
      email: user.email,
      email_verified: 1,
      id: user.id,
      last_seen_at: 1,
    })),
  );
  const sessionsStore = createSessionsStore();
  const companions = new Map<string, CompanionRow>();
  for (const companion of fixtures.companions) {
    companions.set(companion.id, companion);
  }
  const jobs: JobRow[] = [];
  const queue: unknown[] = [];

  return {
    ADMIN_EMAILS: "admin@example.com",
    APP_ENV: "dev",
    AUTH_TOKEN_SECRET: "test-auth-secret",
    DB: {
      prepare(sql: string) {
        return buildStatement(sql, { companions, jobs, proUserIds, sessionsStore, usersStore });
      },
    },
    JOB_QUEUE: {
      send: async (payload: unknown) => {
        queue.push(payload);
      },
    },
    jobs,
    queue,
    sessionsStore,
    usersStore,
  } as unknown as TestEnv;
}

function buildStatement(
  sql: string,
  stores: {
    companions: Map<string, CompanionRow>;
    jobs: JobRow[];
    proUserIds: Set<string>;
    sessionsStore: SessionsStore;
    usersStore: UsersStore;
  },
) {
  const exec = (values: unknown[]) => ({
    async all<T>(): Promise<{ results: T[] }> {
      if (sql.includes("FROM companion_art_jobs") && sql.includes("WHERE companion_id = ?")) {
        const [companionId] = values as [string];
        return { results: stores.jobs.filter((job) => job.companion_id === companionId) as unknown as T[] };
      }
      return { results: [] };
    },
    async first<T>(): Promise<T | null> {
      const sessionResult = stores.sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "first") return sessionResult.result as unknown as T | null;
      const userResult = stores.usersStore.handle(sql, values);
      if (userResult?.kind === "first") return userResult.result as unknown as T | null;
      if (sql.includes("FROM admin_user_allowlist")) return null;
      if (sql.includes("FROM billing_subscriptions") && sql.includes("status IN ('active', 'trialing')")) {
        const [userId] = values as [string];
        if (!stores.proUserIds.has(userId)) return null;
        return {
          current_period_end: Number.MAX_SAFE_INTEGER,
          id: `sub-${userId}`,
          status: "active",
          user_id: userId,
        } as unknown as T;
      }
      if (sql.includes("FROM companions") && sql.includes("WHERE id = ?")) {
        const [id] = values as [string];
        const companion = stores.companions.get(id) ?? null;
        return companion && companion.is_active === 1 ? (companion as unknown as T) : null;
      }
      if (sql.includes("FROM companion_art_jobs") && sql.includes("status IN")) {
        const [companionId, emotion, sourceArtUrl] = values as [string, string, string];
        return (
          stores.jobs.find(
            (job) =>
              job.companion_id === companionId &&
              job.emotion === emotion &&
              job.source_art_url === sourceArtUrl &&
              (job.status === "pending" || job.status === "processing"),
          ) ?? null
        ) as unknown as T | null;
      }
      if (sql.includes("FROM companion_art_jobs WHERE companion_id = ? AND emotion = ? AND source_art_url = ?")) {
        const [companionId, emotion, sourceArtUrl] = values as [string, string, string];
        return (
          stores.jobs.find(
            (job) =>
              job.companion_id === companionId &&
              job.emotion === emotion &&
              job.source_art_url === sourceArtUrl,
          ) ?? null
        ) as unknown as T | null;
      }
      return null;
    },
    async run() {
      const sessionResult = stores.sessionsStore.handle(sql, values);
      if (sessionResult?.kind === "run") return sessionResult.result;
      const userResult = stores.usersStore.handle(sql, values);
      if (userResult?.kind === "run") return userResult.result;
      if (sql.includes("INSERT INTO companion_art_jobs")) {
        const [id, companionId, userId, emotion, sourceArtUrl, prompt, createdAt, updatedAt] =
          values as [string, string, string | null, string, string, string, number, number];
        stores.jobs.push({
          completed_at: null,
          companion_id: companionId,
          created_at: createdAt,
          credit_txn_id: null,
          emotion,
          error_code: null,
          error_message: null,
          external_task_id: null,
          id,
          model: null,
          output_key: null,
          prompt,
          provider: null,
          source_art_url: sourceArtUrl,
          status: "pending",
          updated_at: updatedAt,
          user_id: userId,
        });
      }
      return { meta: { changes: 1 } };
    },
  });

  return {
    ...exec([]),
    bind(...values: unknown[]) {
      return exec(values);
    },
  };
}

async function issueToken(env: TestEnv, email: string): Promise<string> {
  return issueTestSessionToken(env, email);
}

function authedRequest(url: string, token: string, method = "GET"): Request {
  return new Request(url, {
    headers: { authorization: `Bearer ${token}` },
    method,
  });
}

function userCompanion(id: string, owner: string): CompanionRow {
  return {
    appearance: "Soft sweater",
    art_emotions: JSON.stringify({ neutral: `companions/user/${owner}/neutral.webp` }),
    art_url: `companions/user/${owner}/neutral.webp`,
    created_by: owner,
    gender: "female",
    id,
    is_active: 1,
    name: id,
    personality: "Warm",
    relationship_role: "friend",
    source: "user",
  };
}

function officialCompanion(id: string): CompanionRow {
  return {
    ...userCompanion(id, "official"),
    created_by: null,
    source: "official",
  };
}
