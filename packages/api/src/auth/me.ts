import { jsonResponse } from "../http";
import { loadUserWithProviders } from "./repository";
import { revokeSession, verifyAuthToken, verifyRequestAuth } from "./session";
import { authError } from "./types";
import type { AuthEnv, AuthPayload } from "./types";

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

  return jsonResponse({
    id: userWithProviders.id,
    email: userWithProviders.email,
    email_verified: userWithProviders.email_verified === 1,
    display_name: userWithProviders.display_name,
    linked_providers: userWithProviders.linked_providers,
    subscription: { status: "free", current_period_end: null },
    quota: { messages_used_today: 0, messages_limit_today: 30 },
  });
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
