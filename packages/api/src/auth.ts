import { jsonResponse, readJson } from "./http";
import { ensureUserByEmail, normalizeEmail, type UserRecord } from "./identity";

type AuthEnv = Env & {
  ADMIN_EMAILS?: string;
  AUTH_TOKEN_SECRET?: string;
  DEV_AUTH_TOKEN_TTL_SECONDS?: string;
};

type DevSessionRequest = {
  email?: string;
};

type AuthPayload = {
  email: string;
  exp: number;
  iat: number;
  sub: string;
};

const DEFAULT_DEV_TOKEN_TTL_SECONDS = 60 * 60 * 8;
const DEV_FALLBACK_SECRET = "xtbit-local-dev-auth-token-secret";
const DEFAULT_ADMIN_EMAILS = ["admin@aiappsbox.com"];

export async function handleAuthRequest(request: Request, env: Env, pathname: string): Promise<Response | null> {
  if (pathname !== "/auth/dev-session") {
    return null;
  }

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
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + readDevTokenTtl(env as AuthEnv);
  const token = await signAuthToken(env as AuthEnv, {
    email: user.email,
    exp: expiresAt,
    iat: issuedAt,
    sub: user.id,
  });

  return jsonResponse({
    email: user.email,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    token,
    user,
  });
}

export async function requireAuthEmail(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<string> {
  const payload = await verifyRequestAuth(env as AuthEnv, request);
  if (payload) {
    return payload.email;
  }

  if (isDevRuntime(env)) {
    const email = normalizeEmail(fallbackEmail);
    if (email) {
      return email;
    }
  }

  throw authError("auth_required", 401);
}

export async function optionalAuthEmail(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<string | undefined> {
  const payload = await verifyRequestAuth(env as AuthEnv, request);
  if (payload) {
    return payload.email;
  }

  if (isDevRuntime(env)) {
    return normalizeEmail(fallbackEmail);
  }

  return undefined;
}

export async function requireAuthUser(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<UserRecord> {
  return ensureUserByEmail(env, await requireAuthEmail(env, request, fallbackEmail));
}

export async function requireAdminUser(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<UserRecord> {
  const user = await requireAuthUser(env, request, fallbackEmail);
  if (!isAdminEmail(env, user.email)) {
    throw authError("admin_required", 403);
  }

  return user;
}

export async function requireAdminEmail(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<string> {
  return (await requireAdminUser(env, request, fallbackEmail)).email;
}

export async function optionalAuthUser(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<UserRecord | null> {
  const email = await optionalAuthEmail(env, request, fallbackEmail);
  return email ? ensureUserByEmail(env, email) : null;
}

export function isDevRuntime(env: Pick<Env, "APP_ENV">): boolean {
  return env.APP_ENV !== "prod";
}

export function isAdminEmail(env: Env, email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && readAdminEmails(env as AuthEnv).has(normalized));
}

function authError(error: string, status: number): Response {
  return jsonResponse({ error }, { status });
}

async function verifyRequestAuth(env: AuthEnv, request: Request): Promise<AuthPayload | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    return null;
  }

  return verifyAuthToken(env, token);
}

async function signAuthToken(env: AuthEnv, payload: AuthPayload): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const signature = await hmacSha256(env, data);

  return `${data}.${signature}`;
}

async function verifyAuthToken(env: AuthEnv, token: string): Promise<AuthPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw authError("invalid_token", 401);
  }

  const [header, body, signature] = parts as [string, string, string];
  const key = await importHmacKey(readAuthSecret(env));
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(signature),
    new TextEncoder().encode(`${header}.${body}`),
  );
  if (!valid) {
    throw authError("invalid_token", 401);
  }

  const payload = parsePayload(body);
  if (!payload) {
    throw authError("invalid_token", 401);
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw authError("token_expired", 401);
  }

  return payload;
}

async function hmacSha256(env: AuthEnv, data: string): Promise<string> {
  const key = await importHmacKey(readAuthSecret(env));
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"],
  );
}

function readAuthSecret(env: AuthEnv): string {
  const configured = env.AUTH_TOKEN_SECRET?.trim();
  if (configured) {
    return configured;
  }

  if (isDevRuntime(env)) {
    return DEV_FALLBACK_SECRET;
  }

  throw authError("auth_secret_missing", 500);
}

function readDevTokenTtl(env: AuthEnv): number {
  const configured = Number(env.DEV_AUTH_TOKEN_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DEV_TOKEN_TTL_SECONDS;
}

function readAdminEmails(env: AuthEnv): Set<string> {
  const configured = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter((email): email is string => Boolean(email));
  const emails = configured.length ? configured : DEFAULT_ADMIN_EMAILS;
  return new Set(emails);
}

function parsePayload(value: string): AuthPayload | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as Partial<AuthPayload>;
    const email = normalizeEmail(parsed.email);
    if (!email || typeof parsed.sub !== "string" || typeof parsed.exp !== "number" || typeof parsed.iat !== "number") {
      return null;
    }

    return {
      email,
      exp: parsed.exp,
      iat: parsed.iat,
      sub: parsed.sub,
    };
  } catch {
    return null;
  }
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
