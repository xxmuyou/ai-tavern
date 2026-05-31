import { SignJWT, jwtVerify } from "jose";

import { findUserById, normalizeEmail, type UserRecord } from "../identity";
import { getSetting } from "../settings/store";
import {
  DEFAULT_SESSION_TTL_SECONDS,
  DEV_FALLBACK_SECRET,
  authError,
  isDevRuntime,
} from "./types";
import type { AuthEnv, AuthPayload, SessionResponse } from "./types";

type SignSessionInput = {
  userId: string;
  email: string;
  ttlSeconds?: number;
  now?: number;
};

export async function signSession(env: AuthEnv, input: SignSessionInput): Promise<SessionResponse> {
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1000);
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const expiresAt = issuedAt + ttlSeconds;
  const sessionId = crypto.randomUUID();
  const jti = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, jwt_jti, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  )
    .bind(sessionId, input.userId, jti, issuedAt * 1000, expiresAt * 1000)
    .run();

  const secret = encodeSecret(await readSigningSecret(env));
  const token = await new SignJWT({ email: input.email, jti })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(secret);

  return {
    token,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    email: input.email,
    user: { id: input.userId, email: input.email },
  };
}

export async function verifyAuthToken(env: AuthEnv, token: string): Promise<AuthPayload> {
  const secret = encodeSecret(await readSigningSecret(env));
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw authError("invalid_token", 401);
  }

  const normalized = parsePayload(payload);
  if (!normalized) {
    throw authError("invalid_token", 401);
  }

  if (normalized.exp <= Math.floor(Date.now() / 1000)) {
    throw authError("token_expired", 401);
  }

  const session = await env.DB.prepare(
    `SELECT id, user_id, jwt_jti, expires_at, revoked_at FROM sessions
     WHERE jwt_jti = ? AND user_id = ?`,
  )
    .bind(normalized.jti, normalized.sub)
    .first<{
      id: string;
      user_id: string;
      jwt_jti: string;
      expires_at: number;
      revoked_at: number | null;
    }>();

  if (!session) {
    throw authError("invalid_token", 401);
  }

  if (session.revoked_at !== null) {
    throw authError("session_revoked", 401);
  }

  if (session.expires_at <= Date.now()) {
    throw authError("token_expired", 401);
  }

  return normalized;
}

export async function verifyRequestAuth(env: AuthEnv, request: Request): Promise<AuthPayload | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    return null;
  }

  return verifyAuthToken(env, token);
}

export async function loadUserFromAuth(env: AuthEnv, payload: AuthPayload): Promise<UserRecord> {
  const user = await findUserById(env, payload.sub);
  if (!user) {
    throw authError("invalid_token", 401);
  }
  return user;
}

export async function revokeSession(env: AuthEnv, jti: string, now: number = Date.now()): Promise<void> {
  await env.DB.prepare(`UPDATE sessions SET revoked_at = ? WHERE jwt_jti = ? AND revoked_at IS NULL`)
    .bind(now, jti)
    .run();
}

async function readSigningSecret(env: AuthEnv): Promise<string> {
  const primary = await getSetting(env, "auth.jwt_signing_key");
  if (primary) {
    return primary;
  }

  const legacy = await getSetting(env, "auth.legacy_token_secret");
  if (legacy) {
    return legacy;
  }

  if (isDevRuntime(env)) {
    return DEV_FALLBACK_SECRET;
  }

  throw authError("auth_secret_missing", 500);
}

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function parsePayload(payload: Record<string, unknown>): AuthPayload | null {
  const email = normalizeEmail(payload.email as string | undefined);
  const sub = payload.sub;
  const jti = payload.jti;
  const iat = payload.iat;
  const exp = payload.exp;

  if (!email || typeof sub !== "string" || typeof jti !== "string" || typeof iat !== "number" || typeof exp !== "number") {
    return null;
  }

  return { sub, email, jti, iat, exp };
}
