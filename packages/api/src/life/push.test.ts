import { describe, expect, it } from "vitest";

import { maybeSendDailyPush } from "./push";

type UserRow = { push_enabled: number; timezone: string | null; last_seen_at: number };

function buildEnv(opts: {
  user: UserRow;
  alreadySent?: boolean;
  lonelyCompanion?: { companion_id: string; name: string } | null;
  tokens?: Array<{ token: string; platform: string }>;
}) {
  const store = new Map<string, string>();
  if (opts.alreadySent) {
    // any non-empty value is treated as "already sent today"
    store.set("push:sent:u1:any", "1");
  }
  const logs: unknown[] = [];

  const env = {
    APP_ENV: "dev",
    CONFIG: {
      async get(key: string) {
        for (const k of store.keys()) {
          if (key === k) return store.get(k);
        }
        // Mimic "any-date" lookup so tests don't depend on today's date_local.
        if (opts.alreadySent && key.startsWith("push:sent:u1:")) return "1";
        return null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
    },
    DB: {
      prepare(sql: string) {
        const s = sql.replace(/\s+/g, " ").trim();
        return {
          bind(...binds: unknown[]) {
            void binds;
            return {
              async first<T>(): Promise<T | null> {
                if (s.startsWith("SELECT push_enabled, timezone, last_seen_at")) {
                  return opts.user as unknown as T;
                }
                if (s.startsWith("SELECT s.companion_id, c.name FROM companion_daily_states")) {
                  return (opts.lonelyCompanion ?? null) as T | null;
                }
                return null;
              },
              async all<T>(): Promise<{ results: T[] }> {
                if (s.startsWith("SELECT token, platform FROM push_tokens")) {
                  return { results: (opts.tokens ?? []) as unknown as T[] };
                }
                return { results: [] };
              },
              async run() { return { meta: { changes: 1 } }; },
            };
          },
        };
      },
    },
  } as unknown as Env;

  // intercept console.log so we can assert dry-run payloads
  const origLog = console.log;
  console.log = (...args: unknown[]) => { logs.push(args); };
  return { env, logs, restore() { console.log = origLog; } };
}

describe("maybeSendDailyPush", () => {
  it("does not send when push_enabled = 0", async () => {
    const { env, restore } = buildEnv({ user: { push_enabled: 0, timezone: "UTC", last_seen_at: 0 } });
    const r = await maybeSendDailyPush(env, "u1");
    restore();
    expect(r.sent).toBe(false);
  });

  it("does not send when already sent today (KV flag present)", async () => {
    const { env, restore } = buildEnv({
      user: { push_enabled: 1, timezone: "UTC", last_seen_at: 0 },
      alreadySent: true,
      lonelyCompanion: { companion_id: "maya", name: "Maya" },
    });
    const r = await maybeSendDailyPush(env, "u1");
    restore();
    expect(r.sent).toBe(false);
  });

  it("sends a special_state push when a lonely companion is in cache", async () => {
    const { env, logs, restore } = buildEnv({
      user: { push_enabled: 1, timezone: "UTC", last_seen_at: Date.now() },
      lonelyCompanion: { companion_id: "maya", name: "Maya" },
      tokens: [{ token: "abc", platform: "ios" }],
    });
    const r = await maybeSendDailyPush(env, "u1");
    restore();
    expect(r.sent).toBe(true);
    expect(r.payload?.category).toBe("special_state");
    expect(logs.length).toBeGreaterThan(0);
  });

  it("falls back to reengagement when nothing else qualifies", async () => {
    const { env, restore } = buildEnv({
      user: {
        push_enabled: 1,
        timezone: "UTC",
        last_seen_at: Date.now() - 48 * 60 * 60 * 1000,
      },
      lonelyCompanion: null,
    });
    const r = await maybeSendDailyPush(env, "u1");
    restore();
    expect(r.sent).toBe(true);
    expect(r.payload?.category).toBe("reengagement");
  });

  it("does nothing when user just used the app", async () => {
    const { env, restore } = buildEnv({
      user: { push_enabled: 1, timezone: "UTC", last_seen_at: Date.now() },
      lonelyCompanion: null,
    });
    const r = await maybeSendDailyPush(env, "u1");
    restore();
    expect(r.sent).toBe(false);
  });
});
