import { jsonResponse, readJson } from "../http";
import { ensureUserByEmail, normalizeEmail } from "../identity";
import { signSession } from "./session";
import { DEFAULT_DEV_TOKEN_TTL_SECONDS, isDevRuntime } from "./types";
import type { AuthEnv } from "./types";

type DevSessionRequest = {
  email?: string;
};

export async function handleDevSession(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  if (!isDevRuntime(env)) {
    return jsonResponse({ error: "dev_auth_disabled" }, { status: 403 });
  }

  const body = await readJson<DevSessionRequest>(request);
  const email = normalizeEmail(body.email);
  if (!email) {
    return jsonResponse({ error: "email_required" }, { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const session = await signSession(env as AuthEnv, {
    userId: user.id,
    email: user.email,
    ttlSeconds: readDevTokenTtl(env as AuthEnv),
  });

  return jsonResponse(session);
}

function readDevTokenTtl(env: AuthEnv): number {
  const configured = Number(env.DEV_AUTH_TOKEN_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DEV_TOKEN_TTL_SECONDS;
}
