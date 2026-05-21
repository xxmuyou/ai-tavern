import { describe, expect, it } from "vitest";

import {
  checkQuota,
  checkRateLimit,
  dailyKey,
  incrementQuota,
  isSubscriberActive,
  minuteKey,
  QUOTA_LIMITS,
} from "./quota";

function createKV(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const puts: Array<{ key: string; value: string; ttl?: number }> = [];
  const kv = {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
      store.set(key, value);
      puts.push({ key, ttl: options?.expirationTtl, value });
    },
  };
  return { kv, puts, store };
}

function createEnv(opts: {
  kv: ReturnType<typeof createKV>["kv"];
  subscriptionRow?: { ok: number } | null;
}): Env {
  return {
    CONFIG: opts.kv,
    DB: {
      prepare(_sql: string) {
        const exec = () => ({
          async first<T>(): Promise<T | null> {
            return (opts.subscriptionRow ?? null) as T | null;
          },
        });
        return {
          ...exec(),
          bind(..._values: unknown[]) {
            return exec();
          },
        };
      },
    },
  } as unknown as Env;
}

const NOW = Date.UTC(2026, 4, 21, 9, 30, 0); // 2026-05-21T09:30Z

describe("quota key formatting", () => {
  it("daily key uses UTC YYYY-MM-DD", () => {
    expect(dailyKey("user-1", NOW, false)).toBe("quota:user-1:2026-05-21");
    expect(dailyKey("user-1", NOW, true)).toBe("quota:user-1:2026-05-21:sub");
  });

  it("minute key uses UTC YYYY-MM-DDTHH:MM", () => {
    expect(minuteKey("user-1", NOW)).toBe("ratelimit:user-1:2026-05-21T09:30");
  });

  it("rolls over correctly at UTC midnight", () => {
    const before = Date.UTC(2026, 4, 21, 23, 59, 59);
    const after = Date.UTC(2026, 4, 22, 0, 0, 0);
    expect(dailyKey("u", before, false)).toBe("quota:u:2026-05-21");
    expect(dailyKey("u", after, false)).toBe("quota:u:2026-05-22");
  });
});

describe("checkRateLimit", () => {
  it("allows up to 10 in a minute, then blocks", async () => {
    const { kv } = createKV();
    const env = createEnv({ kv });

    for (let i = 0; i < QUOTA_LIMITS.RATE_PER_MINUTE; i++) {
      const r = await checkRateLimit(env, "u", NOW);
      expect(r.ok).toBe(true);
    }
    const blocked = await checkRateLimit(env, "u", NOW);
    expect(blocked.ok).toBe(false);
  });

  it("sets a TTL of 120s", async () => {
    const { kv, puts } = createKV();
    const env = createEnv({ kv });
    await checkRateLimit(env, "u", NOW);
    expect(puts[0]?.ttl).toBe(120);
  });
});

describe("checkQuota / incrementQuota", () => {
  it("free user blocked at 30", async () => {
    const { kv } = createKV({ "quota:u:2026-05-21": "30" });
    const env = createEnv({ kv });

    const r = await checkQuota(env, "u", NOW, false);
    expect(r.ok).toBe(false);
  });

  it("free user with 29 has 1 remaining", async () => {
    const { kv } = createKV({ "quota:u:2026-05-21": "29" });
    const env = createEnv({ kv });
    const r = await checkQuota(env, "u", NOW, false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(1);
  });

  it("subscriber soft cap at 1000", async () => {
    const { kv } = createKV({ "quota:u:2026-05-21:sub": "1000" });
    const env = createEnv({ kv });
    const r = await checkQuota(env, "u", NOW, true);
    expect(r.ok).toBe(false);
  });

  it("incrementQuota writes count + day TTL", async () => {
    const { kv, puts } = createKV({ "quota:u:2026-05-21": "5" });
    const env = createEnv({ kv });
    await incrementQuota(env, "u", NOW, false);
    expect(puts[0]).toEqual({ key: "quota:u:2026-05-21", ttl: 90_000, value: "6" });
  });

  it("treats non-numeric counter as 0", async () => {
    const { kv } = createKV({ "quota:u:2026-05-21": "garbage" });
    const env = createEnv({ kv });
    const r = await checkQuota(env, "u", NOW, false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(30);
  });
});

describe("isSubscriberActive", () => {
  it("returns false when no active subscription row exists", async () => {
    const { kv } = createKV();
    const env = createEnv({ kv, subscriptionRow: null });
    expect(await isSubscriberActive(env, "u", NOW)).toBe(false);
  });

  it("returns true when DB returns a row (spec-010 will fill these)", async () => {
    const { kv } = createKV();
    const env = createEnv({ kv, subscriptionRow: { ok: 1 } });
    expect(await isSubscriberActive(env, "u", NOW)).toBe(true);
  });
});
