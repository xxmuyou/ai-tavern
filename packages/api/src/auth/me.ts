import { jsonResponse, readJson } from "../http";
import { getBillingStatus } from "../billing/entitlements";
import { isAdminUser } from "./guards";
import { loadUserWithProviders } from "./repository";
import { revokeSession, verifyAuthToken, verifyRequestAuth } from "./session";
import { authError } from "./types";
import type { AuthEnv, AuthPayload } from "./types";

const KNOWN_PREFERENCES = new Set(["male", "female", "any"]);

export async function handleMe(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  let payload: AuthPayload | null;
  try {
    payload = await verifyRequestAuth(env, request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  if (!payload) {
    return authError("auth_required", 401);
  }

  const userWithProviders = await loadUserWithProviders(env, payload.sub);
  if (!userWithProviders) {
    return authError("invalid_token", 401);
  }

  const adminOverride = await isAdminUser(env, userWithProviders.email);
  const billing = await getBillingStatus(env, payload.sub, undefined, { adminOverride });

  return jsonResponse({
    id: userWithProviders.id,
    email: userWithProviders.email,
    email_verified: userWithProviders.email_verified === 1,
    display_name: userWithProviders.display_name,
    romance_preference: userWithProviders.romance_preference,
    timezone: userWithProviders.timezone,
    push_enabled: userWithProviders.push_enabled,
    linked_providers: userWithProviders.linked_providers,
    is_admin: adminOverride,
    subscription: billing.subscription,
    quota: {
      messages_limit_today: billing.usage.message_limit_daily,
      messages_used_today: billing.usage.messages_used_today,
      subscriber_soft_threshold_exceeded: billing.usage.subscriber_soft_threshold_exceeded,
    },
  });
}

function isValidIanaTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function handleMePreferences(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== "PATCH") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  let payload: AuthPayload | null;
  try {
    payload = await verifyRequestAuth(env, request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  if (!payload) {
    return authError("auth_required", 401);
  }

  const body = await readJson<unknown>(request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  const updates: string[] = [];
  const binds: unknown[] = [];
  const echoed: Record<string, unknown> = {};

  if ("romance_preference" in input) {
    const raw = input.romance_preference;
    if (typeof raw !== "string" || !KNOWN_PREFERENCES.has(raw)) {
      return jsonResponse({ error: "invalid_romance_preference" }, { status: 400 });
    }
    updates.push("romance_preference = ?");
    binds.push(raw);
    echoed.romance_preference = raw;
  }

  if ("timezone" in input) {
    const raw = input.timezone;
    if (raw !== null && (typeof raw !== "string" || !isValidIanaTimezone(raw))) {
      return jsonResponse({ error: "invalid_timezone" }, { status: 400 });
    }
    updates.push("timezone = ?");
    binds.push(raw);
    echoed.timezone = raw ?? null;
  }

  if ("push_enabled" in input) {
    const raw = input.push_enabled;
    if (typeof raw !== "boolean") {
      return jsonResponse({ error: "invalid_push_enabled" }, { status: 400 });
    }
    updates.push("push_enabled = ?");
    binds.push(raw ? 1 : 0);
    echoed.push_enabled = raw;
  }

  if (updates.length === 0) {
    return jsonResponse({ error: "no_supported_fields" }, { status: 400 });
  }

  binds.push(payload.sub);
  await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  return jsonResponse(echoed);
}

export async function handleLogout(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    return authError("auth_required", 401);
  }

  let payload: Awaited<ReturnType<typeof verifyAuthToken>>;
  try {
    payload = await verifyAuthToken(env, token);
  } catch {
    return authError("auth_required", 401);
  }

  await revokeSession(env, payload.jti);
  return jsonResponse({ ok: true });
}
