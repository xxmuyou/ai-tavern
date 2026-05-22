import { describe, expect, it } from "vitest";

import {
  buildUsageDto,
  checkMessageQuota,
  incrementMessageQuota,
  messageQuotaKey,
  QUOTA_LIMITS,
} from "./quota";

const NOW = Date.UTC(2026, 4, 21, 9, 30, 0);

describe("billing quota", () => {
  it("uses the spec-010 message key", () => {
    expect(messageQuotaKey("u-1", NOW)).toBe("quota:u-1:2026-05-21:messages");
  });

  it("blocks free users at 30 messages", async () => {
    const env = createEnv({ "quota:u-1:2026-05-21:messages": "30" });
    expect(await checkMessageQuota(env, "u-1", NOW, "free")).toEqual({ ok: false, reason: "quota_exceeded" });
  });

  it("does not block pro users at the soft threshold", async () => {
    const env = createEnv({ "quota:u-1:2026-05-21:messages": "1000" });
    expect(await checkMessageQuota(env, "u-1", NOW, "pro")).toEqual({ ok: true, remaining: null });
    await expect(buildUsageDto(env, "u-1", NOW, "pro")).resolves.toMatchObject({
      subscriber_soft_threshold_exceeded: false,
    });
  });

  it("flags pro users above the soft threshold in usage", async () => {
    const env = createEnv({ "quota:u-1:2026-05-21:messages": String(QUOTA_LIMITS.SUBSCRIBER_DAILY_SOFT + 1) });
    await expect(buildUsageDto(env, "u-1", NOW, "pro")).resolves.toMatchObject({
      message_limit_daily: null,
      messages_used_today: 1001,
      subscriber_soft_threshold_exceeded: true,
    });
  });

  it("increments with the daily TTL", async () => {
    const env = createEnv({ "quota:u-1:2026-05-21:messages": "5" });
    await incrementMessageQuota(env, "u-1", NOW);
    expect(env.puts[0]).toEqual({ key: "quota:u-1:2026-05-21:messages", ttl: 90_000, value: "6" });
  });
});

function createEnv(initial: Record<string, string> = {}): Env & {
  puts: Array<{ key: string; value: string; ttl?: number }>;
} {
  const store = new Map(Object.entries(initial));
  const puts: Array<{ key: string; value: string; ttl?: number }> = [];
  return {
    CONFIG: {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string, options?: { expirationTtl?: number }) {
        store.set(key, value);
        puts.push({ key, ttl: options?.expirationTtl, value });
      },
    },
    puts,
  } as unknown as Env & { puts: Array<{ key: string; value: string; ttl?: number }> };
}
