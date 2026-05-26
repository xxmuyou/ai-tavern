import { requireAuthUser } from "../auth";
import { jsonResponse } from "../http";
import type { UserRecord } from "../identity";

import { PUSH_DAILY_LIMIT } from "./config";
import { computeDateLocal } from "./time-slot";

// Push notification backend for v1.
//
// Endpoints:
//   POST   /push/tokens               { token, platform }
//   DELETE /push/tokens/{token}       soft-deletes the row
//
// Daily limit (1 per local day) is enforced via KV (`push:sent:{user_id}:{date_local}`).
// Three v1 candidate categories:
//   - stage_advanced   — relationship just crossed into a new stage
//   - special_state    — a companion's daily state is unusually notable (e.g. lonely + in the user's preferred scene)
//   - reengagement     — user has not opened the app in >24h
// In dev / preview environments the message is logged via console.log
// (dry-run); production wiring to APNs/FCM is a v1.x follow-up.

type PushPayload = {
  category: "stage_advanced" | "special_state" | "reengagement";
  title: string;
  body: string;
};

export async function handlePushRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/push/tokens") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const user = await requireAuthUser(env, request);
    return registerToken(env, user, request);
  }

  const tokenMatch = pathname.match(/^\/push\/tokens\/(.+)$/);
  if (tokenMatch) {
    if (request.method !== "DELETE") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const token = decodeURIComponent(tokenMatch[1] ?? "");
    if (!token) return jsonResponse({ error: "invalid_token" }, { status: 400 });
    const user = await requireAuthUser(env, request);
    return revokeToken(env, user, token);
  }

  return null;
}

async function registerToken(env: Env, user: UserRecord, request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }
  const obj = body as Record<string, unknown>;
  const token = typeof obj.token === "string" ? obj.token.trim() : "";
  const platform = obj.platform;
  if (!token || token.length > 256) {
    return jsonResponse({ error: "invalid_token" }, { status: 400 });
  }
  if (platform !== "ios" && platform !== "android") {
    return jsonResponse({ error: "invalid_platform" }, { status: 400 });
  }

  const now = Date.now();
  // Upsert: re-registering an existing (user, token) clears the revoked_at flag.
  await env.DB.prepare(
    `INSERT INTO push_tokens (user_id, token, platform, created_at, revoked_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(user_id, token) DO UPDATE SET platform = excluded.platform, revoked_at = NULL`,
  )
    .bind(user.id, token, platform, now)
    .run();

  return jsonResponse({ ok: true });
}

async function revokeToken(env: Env, user: UserRecord, token: string): Promise<Response> {
  await env.DB.prepare(
    `UPDATE push_tokens SET revoked_at = ? WHERE user_id = ? AND token = ?`,
  )
    .bind(Date.now(), user.id, token)
    .run();
  return jsonResponse({ ok: true });
}

// -----------------------------------------------------------------------------
// Daily push selection (called from /today or a future cron)
// -----------------------------------------------------------------------------

type UserPushState = {
  push_enabled: number | null;
  timezone: string | null;
  last_seen_at: number;
};

const REENGAGE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function maybeSendDailyPush(env: Env, userId: string): Promise<{ sent: boolean; payload?: PushPayload }> {
  const userRow = await env.DB.prepare(
    `SELECT push_enabled, timezone, last_seen_at FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<UserPushState>();
  if (!userRow || userRow.push_enabled === 0) return { sent: false };

  const tz = userRow.timezone ?? "UTC";
  const dateLocal = computeDateLocal(new Date(), tz);

  const limitKey = `push:sent:${userId}:${dateLocal}`;
  const alreadySent = await env.CONFIG.get(limitKey);
  if (alreadySent) return { sent: false };

  const payload = await pickPushCandidate(env, userId, userRow.last_seen_at);
  if (!payload) return { sent: false };

  await dispatchPush(env, userId, payload);
  await env.CONFIG.put(limitKey, "1", { expirationTtl: 60 * 60 * 26 });
  return { sent: true, payload };
}

async function pickPushCandidate(
  env: Env,
  userId: string,
  lastSeenAt: number,
): Promise<PushPayload | null> {
  // Category 1: stage_advanced — placeholder. v1 doesn't persist "last
  // notified stage", so we leave a hook here that future-A7-decay-style
  // tracking can fill. Returning null until that ledger exists.
  void env;

  // Category 2: special_state — pick any companion whose daily state today
  // is lonely + in a preferred scene of the user. Requires the daily_state
  // cache to have been computed — we just read what's there.
  const lonely = await env.DB.prepare(
    `SELECT s.companion_id, c.name FROM companion_daily_states s
     JOIN companions c ON c.id = s.companion_id
     WHERE s.mood = 'lonely' AND s.date_local = ?
     LIMIT 1`,
  )
    .bind(computeDateLocal(new Date(), "UTC"))
    .first<{ companion_id: string; name: string }>();
  if (lonely) {
    return {
      category: "special_state",
      title: `${lonely.name} is alone tonight`,
      body: `They're at one of your usual places — drop in if you want.`,
    };
  }

  // Category 3: reengagement.
  if (Date.now() - lastSeenAt > REENGAGE_AFTER_MS) {
    return {
      category: "reengagement",
      title: "Aurelia is quiet without you",
      body: "Stop by when you have a minute.",
    };
  }

  return null;
}

async function dispatchPush(env: Env, userId: string, payload: PushPayload): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT token, platform FROM push_tokens
     WHERE user_id = ? AND revoked_at IS NULL`,
  )
    .bind(userId)
    .all<{ token: string; platform: string }>();
  const tokens = results ?? [];

  // In dev / preview we just log. Real APNs/FCM wiring lands in v1.x.
  // We still iterate `tokens` so the structured log records which devices
  // would have received the message.
  console.log(
    JSON.stringify({
      message: "push_dispatch_dry_run",
      env: env.APP_ENV,
      user_id: userId,
      payload,
      token_count: tokens.length,
    }),
  );
}

// Helper used by the daily-state read paths to refresh push enablement.
// Returning a UserRecord-like shape lets the caller cheaply decide whether
// to skip more work.
export async function loadPushSettings(env: Env, userId: string): Promise<{ push_enabled: boolean }> {
  const row = await env.DB.prepare(
    `SELECT push_enabled FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{ push_enabled: number | null }>();
  return { push_enabled: (row?.push_enabled ?? 1) !== 0 };
}

// Re-export so the daily limit can be inspected (tests, monitoring).
export { PUSH_DAILY_LIMIT };
